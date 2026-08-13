import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Conv2D, MaxPooling2D, Dropout, UpSampling2D, concatenate, BatchNormalization, Activation
from tensorflow.keras.optimizers import Adam

class SparseMeanIoU(tf.keras.metrics.MeanIoU):
    """Custom MeanIoU metric for Keras when y_true is class indices and y_pred is softmax probabilities."""
    def __init__(self, num_classes, name='mean_iou', dtype=None):
        super().__init__(num_classes=num_classes, name=name, dtype=dtype)
        
    def update_state(self, y_true, y_pred, sample_weight=None):
        y_pred = tf.argmax(y_pred, axis=-1)
        return super().update_state(y_true, y_pred, sample_weight=sample_weight)

def weighted_categorical_crossentropy(weights):
    """
    A weighted version of categorical_crossentropy for segmentation.
    Variables:
        weights: numpy array of shape (num_classes,)
    """
    weights = tf.convert_to_tensor(weights, dtype=tf.float32)
    
    def loss(y_true, y_pred):
        # y_true shape: (batch_size, H, W) or (batch_size, H, W, 1)
        # y_pred shape: (batch_size, H, W, num_classes) (softmax output)
        
        # Squeeze last dimension if it exists
        y_true_squeezed = tf.squeeze(y_true, axis=-1) if len(y_true.shape) == 4 else y_true
        
        # One-hot encode y_true
        num_classes = y_pred.shape[-1]
        y_true_one_hot = tf.one_hot(tf.cast(y_true_squeezed, tf.int32), depth=num_classes)
        
        # Clip probabilities to avoid log(0)
        y_pred = tf.clip_by_value(y_pred, tf.keras.backend.epsilon(), 1.0 - tf.keras.backend.epsilon())
        
        # Calculate cross entropy per pixel: - y_true * log(y_pred)
        cross_entropy = -y_true_one_hot * tf.math.log(y_pred)
        
        # Multiply by class weights
        weighted_cross_entropy = cross_entropy * weights
        
        # Sum over classes, mean over pixels and batch
        return tf.reduce_mean(tf.reduce_sum(weighted_cross_entropy, axis=-1))
        
    return loss

def double_conv_block(x, n_filters):
    """Helper block: (Conv2D => BatchNorm => ReLU) * 2"""
    x = Conv2D(n_filters, 3, padding='same', kernel_initializer='he_normal', use_bias=False)(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    x = Conv2D(n_filters, 3, padding='same', kernel_initializer='he_normal', use_bias=False)(x)
    x = BatchNormalization()(x)
    x = Activation('relu')(x)
    return x

def unet(input_size=(256, 256, 3), num_classes=4, class_weights=None):
    """
    Keras implementation of U-Net with BatchNormalization for high training stability.
    """
    inputs = Input(input_size)
    
    # Down block 1
    conv1 = double_conv_block(inputs, 64)
    pool1 = MaxPooling2D(pool_size=(2, 2))(conv1)
    
    # Down block 2
    conv2 = double_conv_block(pool1, 128)
    pool2 = MaxPooling2D(pool_size=(2, 2))(conv2)
    
    # Down block 3
    conv3 = double_conv_block(pool2, 256)
    pool3 = MaxPooling2D(pool_size=(2, 2))(conv3)
    
    # Down block 4
    conv4 = double_conv_block(pool3, 512)
    drop4 = Dropout(0.5)(conv4)
    pool4 = MaxPooling2D(pool_size=(2, 2))(drop4)

    # Bottleneck
    conv5 = double_conv_block(pool4, 1024)
    drop5 = Dropout(0.5)(conv5)

    # Up block 6
    up6 = Conv2D(512, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(drop5))
    merge6 = concatenate([drop4, up6], axis=3)
    conv6 = double_conv_block(merge6, 512)

    # Up block 7
    up7 = Conv2D(256, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv6))
    merge7 = concatenate([conv3, up7], axis=3)
    conv7 = double_conv_block(merge7, 256)

    # Up block 8
    up8 = Conv2D(128, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv7))
    merge8 = concatenate([conv2, up8], axis=3)
    conv8 = double_conv_block(merge8, 128)

    # Up block 9
    up9 = Conv2D(64, 2, activation='relu', padding='same', kernel_initializer='he_normal')(UpSampling2D(size=(2, 2))(conv8))
    merge9 = concatenate([conv1, up9], axis=3)
    conv9 = double_conv_block(merge9, 64)
    
    # Output projection to num_classes
    conv10 = Conv2D(num_classes, 1, activation='softmax')(conv9)

    model = Model(inputs=inputs, outputs=conv10)
    
    if class_weights is not None:
        print(f"Applying Class Weights to Keras Custom Loss: {class_weights}")
        loss_fn = weighted_categorical_crossentropy(class_weights)
    else:
        loss_fn = 'sparse_categorical_crossentropy'
    
    # Compile model
    model.compile(
        optimizer=Adam(learning_rate=1e-4),
        loss=loss_fn,
        metrics=['accuracy', SparseMeanIoU(num_classes=num_classes, name='mean_iou')]
    )
    
    return model
