import torch
import torch.nn as nn
from torchvision.models import resnet34, ResNet34_Weights

class DoubleConv(nn.Module):
    """(convolution => [BN] => ReLU) * 2"""
    def __init__(self, in_channels, out_channels, mid_channels=None):
        super().__init__()
        if not mid_channels:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(mid_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x):
        return self.double_conv(x)

class ResNet34UNet(nn.Module):
    def __init__(self, n_classes=4, pretrained=True):
        super().__init__()
        
        # Load backbone
        if pretrained:
            weights = ResNet34_Weights.DEFAULT
        else:
            weights = None
        self.backbone = resnet34(weights=weights)
        
        # Extract encoder parts from backbone
        self.init_conv = nn.Sequential(
            self.backbone.conv1,
            self.backbone.bn1,
            self.backbone.relu
        ) # Output: H/2, W/2, 64 channels (Level 1)
        
        self.maxpool = self.backbone.maxpool # Output: H/4, W/4, 64 channels
        
        self.layer1 = self.backbone.layer1 # Output: H/4, W/4, 64 channels (Level 2)
        self.layer2 = self.backbone.layer2 # Output: H/8, W/8, 128 channels (Level 3)
        self.layer3 = self.backbone.layer3 # Output: H/16, W/16, 256 channels (Level 4)
        self.layer4 = self.backbone.layer4 # Output: H/32, W/32, 512 channels (Level 5 - Bottleneck)
        
        # Decoder blocks
        self.up_conv1 = nn.ConvTranspose2d(512, 256, kernel_size=2, stride=2)
        self.conv1 = DoubleConv(512, 256) # 256 from up + 256 from Level 4 skip = 512
        
        self.up_conv2 = nn.ConvTranspose2d(256, 128, kernel_size=2, stride=2)
        self.conv2 = DoubleConv(256, 128) # 128 from up + 128 from Level 3 skip = 256
        
        self.up_conv3 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.conv3 = DoubleConv(128, 64) # 64 from up + 64 from Level 2 skip = 128
        
        self.up_conv4 = nn.ConvTranspose2d(64, 64, kernel_size=2, stride=2)
        self.conv4 = DoubleConv(128, 64) # 64 from up + 64 from Level 1 skip = 128
        
        self.up_conv_final = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
        self.conv_final = DoubleConv(32, 32)
        
        self.outc = nn.Conv2d(32, n_classes, kernel_size=1)

    def forward(self, x):
        # --- Encoder (Forward pass through ResNet34 layers) ---
        x_level0 = x # Input: (3, H, W)
        
        x_level1 = self.init_conv(x_level0) # Output: (64, H/2, W/2)
        x_pool = self.maxpool(x_level1) # Output: (64, H/4, W/4)
        
        x_level2 = self.layer1(x_pool) # Output: (64, H/4, W/4)
        x_level3 = self.layer2(x_level2) # Output: (128, H/8, W/8)
        x_level4 = self.layer3(x_level3) # Output: (256, H/16, W/16)
        x_level5 = self.layer4(x_level4) # Output: (512, H/32, W/32) - Bottleneck
        
        # --- Decoder (Upsampling + skip connections) ---
        up1 = self.up_conv1(x_level5) # (256, H/16, W/16)
        concat1 = torch.cat([up1, x_level4], dim=1) # (512, H/16, W/16)
        dec1 = self.conv1(concat1) # (256, H/16, W/16)
        
        up2 = self.up_conv2(dec1) # (128, H/8, W/8)
        concat2 = torch.cat([up2, x_level3], dim=1) # (256, H/8, W/8)
        dec2 = self.conv2(concat2) # (128, H/8, W/8)
        
        up3 = self.up_conv3(dec2) # (64, H/4, W/4)
        concat3 = torch.cat([up3, x_level2], dim=1) # (128, H/4, W/4)
        dec3 = self.conv3(concat3) # (64, H/4, W/4)
        
        up4 = self.up_conv4(dec3) # (64, H/2, W/2)
        concat4 = torch.cat([up4, x_level1], dim=1) # (128, H/2, W/2)
        dec4 = self.conv4(concat4) # (64, H/2, W/2)
        
        up5 = self.up_conv_final(dec4) # (32, H, W)
        dec5 = self.conv_final(up5) # (32, H, W)
        
        logits = self.outc(dec5) # (n_classes, H, W)
        return logits

if __name__ == "__main__":
    # Quick sanity check
    model = ResNet34UNet(n_classes=4, pretrained=False)
    x = torch.randn(2, 3, 256, 256)
    out = model(x)
    print("Input shape:", x.shape)
    print("Output shape:", out.shape)
    assert out.shape == (2, 4, 256, 256), "Shape mismatch!"
    print("Sanity check passed!")
