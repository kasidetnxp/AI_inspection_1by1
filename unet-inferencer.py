import flask
from flask_cors import CORS
from flask import request, jsonify
import os
from tensorflow import keras
from glob import glob
import numpy as np
import os
import cv2
import requests
import numpy as np
import csv
import re
import io
import sys
import time
import json
import os
import shutil
from os import listdir
from os.path import isfile, join, isdir
import numpy as np
import os
from PIL import Image, ImageEnhance
from past.builtins import execfile

import flask
from flask_cors import CORS
from flask import request, jsonify

import cv2
import requests
import numpy as np

import sys



import time
import glob


import json
import os
import cv2
import matplotlib.pyplot as plt
import numpy as np
from shapely.geometry import Polygon
from shapely import affinity


# font
font = cv2.FONT_HERSHEY_DUPLEX
# fontScale
fontScale = 0.7
# Blue color in BGR
color = (255, 0, 0)
box_color = (0, 255, 0)
focus_box_color = (220, 220, 220)
red_color = (0, 0, 255)
amber_color = (0, 0, 255)
# Line thickness of 2 px
thickness = 1
GAP = 5
ROI = 1

has_processor = False

# with open(output_class_filepath, 'r') as file_:
#    class_data = json.load(file_)

import time
import traceback

csv_file='/app/adc/adc-template/inference-transform.csv'
transformers = []
has_device = False

last_load = time.time()
last_load_check_interval = 60
template_last_modified = 0
skip_labels = []

def populate_int(context, inference_transformer, key, default_value):
    result = None
    if (context.get(key) and context[key] is not None):
        result = int(context[key])

    if (inference_transformer is not None):
        try:
            if (inference_transformer[key] is not None):
                result = int(inference_transformer[key])
        except:
            return result

    if (result is None):
        return default_value
    else:
        return result


def populate_str(context, inference_transformer, key, default_value):
    result = None
    if (context.get(key) and context[key] is not None):
        result = context[key]

    if (inference_transformer is not None):
        try:
            if (inference_transformer[key] is not None):
                result = inference_transformer[key]
        except:
            return result

    if (result is None):
        return default_value
    else:
        return result


def populate_float(context, inference_transformer, key, default_value):
    result = None
    if (context.get(key) and context[key] is not None):
        result = float(context[key])

    if (inference_transformer is not None):
        try:
            if (inference_transformer[key] is not None):
                result = float(inference_transformer[key])
        except:
            if (result is None):
                return default_value
            else:
                return result

    if (result is None):
        return default_value
    else:
        return result


def populate_boolean(context, inference_transformer, key, default_value):
    result = None
    if (context.get(key) and context[key] is not None):
        result = context[key]

    if (inference_transformer is not None):
        try:
            if (inference_transformer[key] is not None):
                result = inference_transformer[key]
        except:
            return result

    if (result is None):
        return default_value
    else:
        return result


def load_template( csv_file ):
    global transformers, has_device, has_v_roi, has_h_roi, template_last_modified, last_load

    if( os.path.exists( csv_file ) ):
        if( len(transformers) == 0  or time.time() - last_load > last_load_check_interval ):
            last_modified = os.path.getmtime( csv_file )
            if( len(transformers) == 0  or last_modified - template_last_modified > 0 ):
                transformers2 = []
                with open(csv_file, mode='r', encoding='utf-8') as f:
                    reader = csv.DictReader(f, delimiter=',')
                    if 'device' in reader.fieldnames:
                        has_device = True
                    if 'v_roi' in reader.fieldnames:
                        has_v_roi = True
                    if 'h_roi' in reader.fieldnames:
                        has_h_roi = True
                    for row in reader:
                        if row["filename_matching"] != "Comment" and int(row["enable"]) == 1:
                            transformers2.append( row )

                    transformers = transformers2
                    template_last_modified = last_modified
                    last_load = time.time()
                    return transformers2
    return transformers




transformers = load_template( csv_file )



def getBoxArea(box):
    return (box[2] - box[0]) * (box[3] - box[1])


def toBlankImage(img):
    blank_image2 = 255 * np.ones(shape=img.shape, dtype=np.uint8)
    return blank_image2


def toPoints(pos):
    xy = []
    # xy = [[pos[i], pos[i+1]] for i in range(0, len(pos), 2)]
    for i in range(0, len(pos), 2):
        xy.append((pos[i], pos[i + 1]))
    # pts = np.array(xy)
    return xy


def toPoint(x, y):
    return (x, y)


def getMasksArea(img, grey, masks, output_url, l_greyscale_xpact, l_greyscale_ypact):
    img2 = toBlankImage(img)
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
    min_greyscale = 0
    max_greyscale = 0
    mask_image = np.zeros(img.shape, dtype=np.uint8)
    greyscale_image = np.zeros(img.shape, dtype=np.uint8)

    ignore_mask_color = (255,) * 3
    for mask in masks:
        maskPts = toPoints(mask)
        mask_xy = []

        for i in range(0, len(mask), 2):
            mask_xy.append((mask[i], mask[i + 1]))
            if (minX == 0):
                minX = mask[i]
            if (maxX == 0):
                maxX = mask[i]
            if (minY == 0):
                minY = mask[i + 1]
            if (maxY == 0):
                maxY = mask[i + 1]
            if (mask[i] < minX):
                minX = mask[i]
            if (mask[i] > maxX):
                maxX = mask[i]
            if (mask[i + 1] < minY):
                minY = mask[i + 1]
            if (mask[i + 1] > maxY):
                maxY = mask[i + 1]

        pts = np.array(mask_xy)
        cv2.fillPoly(img2, np.int32([pts]), (100,100,100))
        cv2.fillPoly(mask_image, np.int32([pts]), (255,255,255))



        m = Polygon( maskPts )
        m2 = affinity.scale( m, xfact=l_greyscale_xpact,yfact=l_greyscale_ypact)
        newPoints = list(m2.exterior.coords)
        gs_pts = [[newPoint[0], newPoint[1]] for newPoint in newPoints]

        cv2.fillPoly(greyscale_image, np.int32([gs_pts]), (255,255,255) )

    a = img2
    a[img2 == 100] = 1

    # print( grey.shape )

    probemarkArea = (a == 1).sum()/3
    greyscale = 255
    if( probemarkArea > 0 and generate_greyscale ):
        output_greyscale_folder = os.path.join(os.path.dirname( output_url ), "greyscale")
        os.makedirs( output_greyscale_folder , exist_ok=True )
        output_greyscale_path = os.path.join( output_greyscale_folder, os.path.basename( output_url ))
        #print( img.shape, greyscale_image.shape)
        print( "Generating: " + output_greyscale_path )
        cv2.imwrite( output_greyscale_path, cv2.bitwise_and( img, greyscale_image ) )

    if (probemarkArea > 0):
        # cv2_imshow(mask_image)
        img2 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        greyscale_image2 = cv2.cvtColor(greyscale_image, cv2.COLOR_BGR2GRAY)
        #print(img2.shape)
        #print(greyscale_image2.shape)
        min, max, min_loc, max_loc = cv2.minMaxLoc( img2, mask=greyscale_image2)
        # masked_image = cv2.bitwise_and(img, mask_image)
        #greyscale_image2 = np.zeros(greyscale_image.shape[:2], np.uint8)
        average = cv2.mean(img, mask=greyscale_image2)
        #cv2.imwrite( output_url + ".offset.tif", img2  )
        #cv2.imwrite( output_url + ".mask.tif", greyscale_image2)

        greyscale = 255 - int((average[0] + average[1] + average[2]) / (3))
        min_greyscale = 255 - max
        max_greyscale = 255 - min

        # print( "average", average )
        # cv2_imshow(masked_image)
    # cv2_imshow(img)
    print( greyscale, min_greyscale, max_greyscale )
    # print("minX: ", minX, ", minY: ", minY, ", maxX:", maxX , ", maxY: " , maxY )
    return probemarkArea, minX, minY, maxX, maxY, greyscale, min_greyscale, max_greyscale
    # return probemarkArea


def drawMaskWithRoi(img, masks, ratio, boxes):

    for mask in masks:
        maskPts = toPoints(mask)
        mask_xy = [[mask[i], mask[i + 1]] for i in range(0, len(mask), 2)]
        pts = np.array(mask_xy)
        isClosed = True
        color = (255, 0, 0)
        thickness = 1

        height = img.shape[0]
        width = img.shape[1]

        roi = (
            int(width / 2 - width * ratio / 2), int(height / 2 - height * ratio / 2), int(width / 2 + width * ratio / 2),
            int(height / 2 + height * ratio / 2))

        mask = np.zeros((height, width), dtype=np.uint8)
        points = np.int32([pts])

        color = (255, 0, 0)

        # Ending coordinate, here (220, 220)
        # represents the bottom right corner of rectangle

        start_point = (roi[0], roi[1])
        end_point = (roi[2], roi[3])
        white = (255, 255, 255)
        font = cv2.FONT_HERSHEY_SIMPLEX

        org = (roi[0] + 5, roi[1] + 5)

        fontScale = 3

        img = cv2.putText(img, 'ROI=' + str(ROI), org, font,
                          fontScale, color, thickness, cv2.LINE_AA)

        img = cv2.rectangle(img, start_point, end_point, white, thickness)

        img = cv2.polylines(img, points,
                            isClosed, color, thickness)



    # cv2.fillPoly(mask, points, (255))

    # res = cv2.bitwise_and(img,img,mask = mask)

    # bg = np.ones_like(res, np.uint8)*255
    # cv2.bitwise_not(bg,bg, mask=mask)
    # res = res + bg

    # rect = cv2.boundingRect(points) # returns (x,y,w,h) of the rect
    # cropped = res[rect[1]: rect[1] + rect[3], rect[0]: rect[0] + rect[2]]

    # cv2_imshow( img )
    return img


def combineOutput(input, output, gap):
    h1, w1 = input.shape[:2]
    h2, w2 = output.shape[:2]

    # create empty matrix
    vis = np.zeros((max(h1, h2), w1 + w2 + gap, 3), np.uint8)

    # combine 2 images
    vis[:h1, :w1, :3] = input
    vis[:h2, w1 + gap:w1 + w2 + gap, :3] = output
    return vis

def isNotSkipLabel( label ):
    global skip_labels
    for l in skip_labels:
        if( label == l ):
            return True

    return True

def isWithinRoi(box, roi):
    result = False
    # print( "box1: ", box )
    # print( "roi:", roi )
    roiX1 = roi[0]
    roiY1 = roi[1]
    roiX2 = roi[2]
    roiY2 = roi[3]

    boxX1 = box[0]
    boxY1 = box[1]
    boxX2 = box[2]
    boxY2 = box[3]

    if (roiX1 <= boxX1 and roiX2 >= boxX2 and roiY1 <= boxY1 and roiY2 >= boxY2):
        result = True

    # if( result ):
    #  print( "It is within")
    # else:
    #  print( "It is not within")

    return result

def toLinearPoints ( polygon ):
    print("toPoints: start: ", polygon)
    pts = []
    for xy in polygon:
        pts.append( xy[0] )
        pts.append( xy[1] )
    print( "toPoints: end: ", pts )
    return pts



def isInsideOrOverlapRoi( box, roi ):


    roiX1 = roi[0]
    roiY1 = roi[1]
    roiX2 = roi[2]
    roiY2 = roi[3]
    roi =  [(roiX1, roiY1), (roiX2, roiY1), (roiX2, roiY2), (roiX1, roiY2)]
    roi = Polygon(roi)
    boxX1 = box[0]
    boxY1 = box[1]
    boxX2 = box[2]
    boxY2 = box[3]
    box =  [(boxX1, boxY1), (boxX2, boxY1), (boxX2, boxY2), (boxX1, boxY2)]
    box = Polygon(box)
    return not box.disjoint(roi)


def isInsideOrOverlapRoi2(box, roi):
    result = False
    # print( "box1: ", box )
    # print( "box2:", roi )
    roiX1 = roi[0]
    roiY1 = roi[1]
    roiX2 = roi[2]
    roiY2 = roi[3]

    boxX1 = box[0]
    boxY1 = box[1]
    boxX2 = box[2]
    boxY2 = box[3]
    boxX3 = box[0]
    boxY3 = box[3]
    boxX4 = box[1]
    boxY4 = box[2]

    if (boxX1 >= roiX1 and boxX1 <= roiX2 and boxY1 >= roiY1 and boxY1 <= roiY2):
        result = True
    if (boxX2 >= roiX1 and boxX2 <= roiX2 and boxY2 >= roiY1 and boxY2 <= roiY2):
        result = True
    if (boxX3 >= roiX1 and boxX3 <= roiX2 and boxY3 >= roiY1 and boxY3 <= roiY2):
        result = True
    if (boxX4 >= roiX1 and boxX4 <= roiX2 and boxY4 >= roiY1 and boxY4 <= roiY2):
        result = True



    # if( result ):
    #  print( "It is within")
    # else:
    #  print( "It is not within")

    return result


def has_bad_labels(label):
    for bad_label in bad_labels:
        if (bad_label == label):
            return True

    return False


def drawMaskBoxesWithRoi(name, ori, img, masks, boxes, ratio, mask_bboxes, box_bboxes, context, box_colors, mask_colors,
                         mask_classes, response, inference_transformer, scores , pad_scores , output_url, v_roi, h_roi ):

    global inference_threshold, area_ratio_threshold, area_ratio_min_threshold, greyscale_threshold, edge_threshold, greyscale_offset, greyscale_xpact, greyscale_ypact
    index = 0
    if (generate_output):
        output_img = img.copy()
    box_count = 1
    damage = False
    response["name"] = name
    response["items"] = []
    l_padThreshold = populate_float(context, inference_transformer, "inferenceThreshold", inference_threshold)

    l_maskThreshold = populate_float(context, inference_transformer, "inferenceThreshold", inference_threshold)

    l_unknownPad = False
    l_unknownMark = False

    l_padThreshold = populate_float(context, inference_transformer, "padThreshold", l_padThreshold)

    l_maskThreshold = populate_float(context, inference_transformer, "maskThreshold", l_maskThreshold)

    l_edge_conversion_factor = populate_float(context, inference_transformer, "edgeConversionFactor",
                                              edge_conversion_factor)
    l_area_ratio_threshold = populate_float(context, inference_transformer, "areaRatioThreshold", area_ratio_threshold)
    l_area_ratio_min_threshold = populate_float(context, inference_transformer, "areaRatioMinThreshold", area_ratio_min_threshold)
    l_greyscale_threshold = populate_float(context, inference_transformer, "greyscaleThreshold", greyscale_threshold)
    l_edge_threshold = populate_float(context, inference_transformer, "edgeThreshold", edge_threshold)
    l_greyscale_offset = populate_float(context, inference_transformer, "greyscaleOffset", greyscale_offset)
    l_greyscale_xpact = populate_float(context, inference_transformer, "greyscaleXpact", greyscale_xpact)
    l_greyscale_ypact = populate_float(context, inference_transformer, "greyscaleYpact", greyscale_ypact)
    if (context.get("unknownPad")):
        l_unknownPad = context["unknownPad"]
    if (context.get("unknownMark")):
        l_unknownMark = context["unknownMark"]

    print("Pad Threshold: ", l_padThreshold, ", Mark Threshold: ", l_maskThreshold)


    height = img.shape[0]
    width = img.shape[1]



    roi = (int(width / 2 - width * h_roi / 2), int(height / 2 - height * v_roi / 2),
           int(width / 2 + h_roi * width / 2), int(height / 2 + height * v_roi / 2))
    start_point = (roi[0], roi[1])
    end_point = (roi[2], roi[3])
    print(start_point, end_point)
    thickness = 1
    white = (255, 255, 255)

    if (generate_output):
        output_img = cv2.rectangle(output_img, start_point, end_point, white, thickness)

    found = False

    code = ""
    min_score = 1

    pad_index = 0
    for mask in boxes:

        if( pad_scores[pad_index] < l_padThreshold ):

            print( "Skip for pad with score: " , pad_scores[pad_index] )
            pad_index = pad_index + 1
            continue
        pad_index = pad_index+1
        maskPts = toPoints(mask)
        mask_xy = [[mask[i], mask[i + 1]] for i in range(0, len(mask), 2)]
        pts = np.array(mask_xy)
        isClosed = True
        color = (255, 0, 0)

        mask = np.zeros((height, width), dtype=np.uint8)
        points = np.int32([pts])

        color = (0, 255, 0)
        # print( roi )

        blue_color = (255, 0, 0)

        font = cv2.FONT_HERSHEY_PLAIN
        org = (roi[0], roi[1] - 5)
        if (roi[1] - 5 < 0):
            org = (roi[0], roi[1] + 5)

        fontScale = 1
        # if( generate_output):
        #  output_img = cv2.putText(output_img, 'ROI(V/H)='+str(vertical_roi)+'/'+str(horizontal_roi), org, font,
        #             fontScale, white, thickness, cv2.LINE_AA)

        # start_point = (5, 5)

        # Ending coordinate, here (220, 220)
        # represents the bottom right corner of rectangle
        # end_point = (220, 220)
        box = box_bboxes[index]
        box_start_point = (int(box[0]), int(box[1]))
        box_end_point = (int(box[2]), int(box[3]))

        if( inference_transformer is not None and inference_transformer["offset"] is not None and int(inference_transformer["offset"]) > 0 ):
            if( int(inference_transformer["offset"]) == 1 ):
                box2 = [ int(box[0]+float(inference_transformer["offset_x1"])),
                         int(box[1]+float(inference_transformer["offset_y1"])),
                         int(box[0] + float(inference_transformer["offset_x1"])+ float(inference_transformer["target_w"])),
                         int(box[1] + float(inference_transformer["offset_y1"])+ float(inference_transformer["target_h"]))

                         ]
            elif( int(inference_transformer["offset"]) == 2 ):
                box2 = [int(box[2] + float(inference_transformer["offset_x2"]) - float(inference_transformer["target_w"])),
                        int(box[3] + float(inference_transformer["offset_y2"]) - float(inference_transformer["target_h"])),
                        int(box[2] + float(inference_transformer["offset_x2"])),
                        int(box[3] + float(inference_transformer["offset_y2"]))]
            print( "Before transformation: ", box )
            print( "After transformation: ", box2)
            box_start_point2 = (int(box2[0]), int(box2[1]))
            box_end_point2 = (int(box2[2]), int(box2[3]))
            box = box2

        isInRoi = isWithinRoi(box, roi)




        if (isInRoi):
            found = True
            if (box[1] - 10 < 0):
                org = (int(box[0]), int(box[1]) + 10)
            else:
                org = (int(box[0]), int(box[1]) - 10)

            # output_img = cv2.putText(output_img, str(box_count), org, font, fontScale, blue_color, thickness, cv2.LINE_AA)
            if (generate_output):
                print(context["padShape"], thing_colors[context["padIndex"]])

                if (context["padShape"] == "rectangle"):
                    if (inference_transformer is not None and int(inference_transformer["hide_original_shape"]) != 1) or inference_transformer is  None:
                        output_img = cv2.rectangle(output_img, box_start_point, box_end_point,
                                                   thing_colors[context["padIndex"]], 1)
                    if inference_transformer is not None and inference_transformer["offset"] is not None and int(inference_transformer["offset"]) > 0:
                        output_img = cv2.rectangle(output_img, box_start_point2, box_end_point2,
                                                   getRGB( inference_transformer["shape_color"]), 1)
                else:
                    output_img = cv2.polylines(output_img, points,
                                               isClosed, thing_colors[context["padIndex"]], thickness)
            maskIndex = 0

            masksInPad = []

            outcome = True
            remarks = ""
            for mask2 in masks:
                if ( scores[maskIndex] < l_maskThreshold):

                    print("Skip for mark with score: ", scores[maskIndex])
                    if( l_unknownMark ):
                        outcome = False
                        damage = True
                        code = code + "U"
                        if (len(remarks) > 0):
                            remarks = remarks + " | unknown mark (" + str(scores[maskIndex]) +  ") | "
                        else:
                            remarks = "unknown mark (" + str(scores[maskIndex]) +  ") | "
                    maskIndex = maskIndex + 1
                    continue
                maskPts2 = toPoints(mask2)
                mask_xy2 = [[mask2[i2], mask2[i2 + 1]] for i2 in range(0, len(mask2), 2)]
                pts2 = np.array(mask_xy2)

                if (isNotSkipLabel(CLASS_NAMES[mask_classes[maskIndex]]) and isWithinRoi(mask_bboxes[maskIndex], roi) and isInsideOrOverlapRoi(mask_bboxes[maskIndex], box)):
                    # box = mask_bboxes[maskIndex]
                    points = np.int32([pts2])
                    if (scores[maskIndex] < min_score):
                        min_score = scores[maskIndex]
                    # img = cv2.rectangle(img, start_point, end_point, white, thickness)
                    if (generate_output):
                        # output_img = cv2.polylines(output_img, points, True, blue_color, thickness)
                        output_img = cv2.polylines(output_img, points, True, thing_colors[mask_classes[maskIndex]],
                                                   thickness)
                    masksInPad.append(mask2)
                    label = CLASS_NAMES[mask_classes[maskIndex]]
                    if (has_bad_labels(label)):
                        outcome = False
                        damage = True
                        code = code + "D"
                        if (len(remarks) > 0):
                            remarks = remarks + " | " + label + " | "
                        else:
                            remarks = label + " | "
                    if (generate_output and l_greyscale_offset is not None and l_greyscale_offset):
                        m = Polygon(maskPts2)
                        m2 = affinity.scale(m, xfact=l_greyscale_xpact, yfact=l_greyscale_ypact)
                        newPoints = list(m2.exterior.coords)
                        gs_pts = [[newPoint[0], newPoint[1]] for newPoint in newPoints]
                        cv2.polylines(output_img, np.int32([gs_pts]), isClosed=True, thickness=1, lineType=cv2.LINE_8,
                                      color=greyscale_border_color)
                        print("Draw greyscale border-----------------")
                maskIndex = maskIndex + 1
            grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            masksArea, minX, minY, maxX, maxY, greyscale, min_greyscale, max_greyscale = getMasksArea(ori, grey, masksInPad,  output_url,l_greyscale_xpact , l_greyscale_ypact)

            # masksAreaPositions = getMasksArea( img, masksInPad )

            padArea = getBoxArea(box)
            if (masksArea > 0):
                bottom = (box[3] - maxY) * l_edge_conversion_factor
                top = (minY - box[1]) * l_edge_conversion_factor
                left = (minX - box[0]) * l_edge_conversion_factor
                right = (box[2] - maxX) * l_edge_conversion_factor
                # print( "ratio:", round(masksArea*100/padArea,2), ",masks: minX: ", minX, ", minY: ", minY, ", maxX:", maxX , ", maxY: " , maxY )
                # print( box_count , ":" + "name:", name, ", ratio:", round(masksArea*100/padArea,2) ,"hasProbemark", ",greyscale:", greyscale, " , bottom: " , bottom , ", top: ", top  , ", left: ", left, ", right: ", right )
                areaRatio = round(masksArea * 100 / padArea, 2)

                ratio = round(masksArea * 100 / padArea, 2)

                # print( "area_ratio_threshold: " , area_ratio_threshold )

                if (l_area_ratio_threshold is not None and ratio > l_area_ratio_threshold):
                    outcome = False

                    remarks = remarks + " area " + '{0:.4f}'.format(ratio) + "> " + str(l_area_ratio_threshold) + " | "
                    # print( 1 )
                if (l_area_ratio_min_threshold is not None and ratio < l_area_ratio_min_threshold):
                    outcome = False

                    remarks = remarks + " area " + '{0:.4f}'.format(ratio) + "< " + str(l_area_ratio_min_threshold) + " | "
                    # print( 1 )
                if (l_edge_threshold is not None and (
                        bottom < l_edge_threshold or top < l_edge_threshold or left < l_edge_threshold or right < l_edge_threshold)):
                    outcome = False

                    remarks = remarks + " edge <" + str(l_edge_threshold) + " | "
                    # ( 2 )
                if (l_greyscale_threshold is not None and greyscale < l_greyscale_threshold ):
                    outcome = False

                    remarks = remarks + " greyscale " + '{0:.4f}'.format(greyscale) + " <" + str(
                        l_greyscale_threshold) + " | "
                    # print(3)

                print(name, ",", box_count, ",", round(masksArea * 100 / padArea, 2), ",", "hasProbemark", ",",
                      greyscale, " ," , min_greyscale, " ," , max_greyscale, " ,", bottom, ",", top, ",", left, ",", right, ",", outcome, ",", remarks)
                item = {"index": box_count, "probemarkRatio": round(masksArea * 100 / padArea, 2), "hasProbemark": True,
                        "greyScale": greyscale,"minGreyScale": min_greyscale , "maxGreyScale": max_greyscale, "bottom": bottom, "top": top, "left": left, "right": right,
                        "pass": outcome, "remarks": remarks}
                response["items"].append(item)

                if (l_edge_threshold is not None and (
                        bottom <= 0 or top <= 0 or left <= 0 or right <= 0)):
                    damage = True
                    code = code + "D"
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ":" + remarks, org, font, fontScale,
                                                 amber_color, 1, cv2.LINE_AA)
                elif (l_edge_threshold is not None and (
                        bottom < l_edge_threshold or top < l_edge_threshold or left < l_edge_threshold or right < l_edge_threshold)):
                    damage = True
                    code = code + "E"
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ":" + remarks, org, font, fontScale,
                                                 amber_color, 1, cv2.LINE_AA)
                elif (l_area_ratio_threshold is not None and ratio > l_area_ratio_threshold):
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ":" + remarks, org, font, fontScale,
                                                 amber_color, 1, cv2.LINE_AA)
                    damage = True
                    code = code + "B"
                elif (l_area_ratio_min_threshold is not None and ratio < l_area_ratio_min_threshold):
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ":" + remarks, org, font, fontScale,
                                                 amber_color, 1, cv2.LINE_AA)
                    damage = True
                    code = code + "B0"

                elif (l_greyscale_threshold is not None and  greyscale < l_greyscale_threshold):
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ":" + remarks, org, font, fontScale,
                                                 amber_color, 1, cv2.LINE_AA)
                    damage = True
                    code = code + "W"
                else:
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count), org, font, fontScale, blue_color, 2,
                                                 cv2.LINE_AA)
            else:
                # print( box_count , ":" + "name:",  name, ", ratio:", round(masksArea*100/padArea,2) , "noProbemark", ",greyscale:", greyscale, )





                if inference_transformer is not None and inference_transformer["check_missing"] is not None and int(
                        inference_transformer["check_missing"]) == 0:
                    print(name, ",", box_count, ",", round(masksArea * 100 / padArea, 2), ",", "noProbemark", ",", 0,
                          " ,",
                          0, ",", 0, ",", 0, ",", 0, ",pass,")
                    item = {"index": box_count, "probemarkRatio": round(masksArea * 100 / padArea, 2),
                            "hasProbemark": False, "greyScale": 0, "minGreyScale": 0, "maxGreyScale": 0, "bottom": 0,
                            "top": 0, "left": 0, "right": 0,
                            "pass": True, "remarks": "skip missing probemark"}
                    outcome = True
                    damage = False
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ": skip", org, font, fontScale,
                                                 red_color,
                                                 1, cv2.LINE_AA)
                else:
                    print(name, ",", box_count, ",", round(masksArea * 100 / padArea, 2), ",", "noProbemark", ",", 0,
                          " ,",
                          0, ",", 0, ",", 0, ",", 0, ",fail,")
                    item = {"index": box_count, "probemarkRatio": round(masksArea * 100 / padArea, 2),
                            "hasProbemark": False, "greyScale": 0, "minGreyScale": 0, "maxGreyScale": 0, "bottom": 0,
                            "top": 0, "left": 0, "right": 0,
                            "pass": False, "remarks": "missing probemark"}
                    outcome = False
                    code = code + "M"
                    damage = True
                    if (generate_output):
                        output_img = cv2.putText(output_img, str(box_count) + ": missing", org, font, fontScale,
                                                 red_color,
                                                 1, cv2.LINE_AA)

                response["items"].append(item)




            box_count = box_count + 1

        # cv2.fillPoly(mask, points, (255))

        # res = cv2.bitwise_and(img,img,mask = mask)

        # bg = np.ones_like(res, np.uint8)*255
        # cv2.bitwise_not(bg,bg, mask=mask)
        # res = res + bg

        # rect = cv2.boundingRect(points) # returns (x,y,w,h) of the rect
        # cropped = res[rect[1]: rect[1] + rect[3], rect[0]: rect[0] + rect[2]]

        index = index + 1
    if (not found):
        item = {"index": 1, "probemarkRatio": 0, "hasProbemark": False,
                "greyScale": 0, "minGreyScale": 0, "maxGreyScale": 0, "bottom": 0, "top": 0, "left": 0, "right": 0, "pass": False,
                "remarks": "Unknown"}
        response["items"].append(item)
        outcome = False
        damage = True
        code = "M"

    if not damage:
        code = "0000"

    response["pass"] = not damage
    response["scores"] = [min_score]
    response["classes"] = [code]

    if (generate_output and not combine_output):
        output_img = output_img
    elif (generate_output and combine_output):
        output_img = combineOutput(ori, output_img, GAP)
    else:
        output_img = None
    return output_img, damage, response


# CLASS_NAMES = ['pad','probemark']


# '{ "devices": "a", "modelPath" : "/app/adc/adc-train/output/model_final.pth", "inferenceThreshold" : 0.7, "preProcessor" : "/app/adc/bin/a-pre-processor.py", "postProcessor":"/app/adc/bin/a-post-processor.py", "servicePort" : 6000 }'

def getRGB(hex):
    hex = hex.lstrip('#')
    hlen = len(hex)
    #return tuple(int(hex[i:i + hlen // 3], 16) for i in range(0, hlen, hlen // 3))
    return tuple(int(hex[i:i + hlen // 3], 16) for i in [4, 2, 0])


try:

    # if( len(sys.argv) != 1 ):
    #    raise Exception( "Missing arguments" )
    print("starting inferencer")
    json_str = sys.argv[1]
    print("Predictor input: " + json_str)
    context = json.loads(json_str)

    model_path = context["modelPath"]
    CLASS_NAMES = context["classNames"]
    bad_labels = context["badLabels"]
    skip_labels = []
    min_area_sizes = []

    if (context.get("skipLabels")):
        skip_labels =context["skipLabels"]

    if (context.get("minAreaSizes")):
        min_area_sizes =context["minAreaSizes"]
    COLORS = context["thingColors"]

    area_ratio_threshold = None
    if (context.get("areaRatioThreshold")):
        area_ratio_threshold = context["areaRatioThreshold"]

    area_ratio_min_threshold = None
    if (context.get("areaRatioMinThreshold")):
        area_ratio_min_threshold = context["areaRatioMinThreshold"]

    edge_threshold = None
    if (context.get("edgeThreshold")):
        edge_threshold = context["edgeThreshold"]

    edge_conversion_factor = 1
    if (context.get("edgeConversionFactor")):
        edge_conversion_factor = context["edgeConversionFactor"]

    greyscale_threshold = None
    if (context.get("greyscaleThreshold")):
        greyscale_threshold = context["greyscaleThreshold"]

    greyscale_offset = None
    if (context.get("greyscaleOffset")):
        greyscale_offset = context["greyscaleOffset"]

    greyscale_border_color = red_color
    if (context.get("greyscaleBorderColor")):
        greyscale_border_color = getRGB(context["greyscaleBorderColor"])

    greyscale_xpact = 1
    if (context.get("greyscaleXpact")):
        greyscale_xpact = context["greyscaleXpact"]

    greyscale_ypact = 1
    if (context.get("greyscaleYpact")):
        greyscale_ypact = context["greyscaleYpact"]

    generate_output = False
    if (context.get("generateOutput")):
        generate_output = context["generateOutput"]

    generate_greyscale = False
    if (context.get("generateGreyscale")):
        generate_greyscale = context["generateGreyscale"]

    if (context.get("combineOutputGap")):
        GAP = context["combineOutputGap"]

    combine_output = False
    if (context.get("combineOutput")):
        combine_output = context["combineOutput"]

    vertical_roi = 0.5
    horizontal_roi = 0.5
    target_width = 640
    target_height = 480
    if (context.get("targetWidth")):
        target_width = context["targetWidth"]
    if (context.get("targetHeight")):
        target_height = context["targetHeight"]

    if (context.get("verticalRoi")):
        vertical_roi = context["verticalRoi"]
    # vertical_roi=0.5

    if (context.get("horizontalRoi")):
        horizontal_roi = context["horizontalRoi"]

    if( context.get("processor") ):
        processor = context["processor"]
        if( os.path.exists(processor)):
            execfile( processor )
            has_processor = True




    thing_colors = []
    for COLOR in COLORS:
        thing_colors.append(getRGB(COLOR))

    inference_threshold = context["inferenceThreshold"]
    service_port = context["servicePort"]


    print("Predictor has been initialized.")
    print("Predictor started for " + model_path)
    model = keras.models.load_model(model_path, compile=False)
    # if( os.path.exists(pre_processor)):
    #    execfile( pre_processor )
    #    pre_process_init()

    # if( os.path.exists(post_processor)):
    #    execfile( post_processor )
    #    post_process_init()

except Exception as e:
    traceback.print_exc()
    print(sys.stderr, 'ERROR: %s' % e)
    sys.exit(1)

def predict(original,THRESHOLD, TARGET_WIDTH, TARGET_HEIGHT, min_area_sizes ):

    global CLASS_NAMES
    image = cv2.resize(original, (TARGET_WIDTH, TARGET_HEIGHT), cv2.INTER_AREA)
    img = np.array([image])
    pred_mask = (model.predict(img))
    pred_masks = []
    output = {
        "scores": [],
        "masks": [],
        "bboxes": [],
        "classes": []

    }

    n_classes = len(CLASS_NAMES) + 1



    for class_index in range(0, n_classes, 1):
        if (class_index > 0):
            pred_masks.append((pred_mask[0, :, :, class_index] > THRESHOLD))


            pred_masks[class_index - 1] = (255 * pred_masks[class_index - 1]).astype('uint8')
            mask = cv2.resize(pred_masks[class_index - 1], (original.shape[1], original.shape[0]), cv2.INTER_AREA)
            ret, thr = cv2.threshold(mask, 1, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for i in range(len(contours)):
                c0 = contours[i]
                x, y, w, h = cv2.boundingRect(c0)
                result = np.squeeze(np.array(c0).reshape(1, -1), axis=0)
                if (len(min_area_sizes) == n_classes - 1):
                    area = cv2.contourArea(c0)
                    if( area <= min_area_sizes[class_index - 1]):
                        print( "skip small area " + str(area) )
                        continue

                output["masks"].append(result.tolist())
                output["classes"].append(class_index - 1)
                output["bboxes"].append([x, y, x + w, y + h])
                output["scores"].append(1)

    return output

def score_image( model, image_url: str, output_url: str, inference_transformer, inference_threshold, target_width, target_height):


    start = int(round(time.time() * 1000))
    print(image_url)

    read_start = time.time()
    #with  Image.open(image_url, "rb") as ori_image:
    import tempfile


    with open(image_url, 'rb') as f:
        ori_image = Image.open(io.BytesIO(f.read()))
        read_end = time.time()

        image = ori_image.copy()
        if inference_transformer is not None:
            if float( inference_transformer["sharpness"] ) != 1.0 :
                image = ImageEnhance.Sharpness(image).enhance(float( inference_transformer["sharpness"] ))
            if float( inference_transformer["brightness"] ) != 1.0 :
                image = ImageEnhance.Brightness(image).enhance(float( inference_transformer["brightness"] ))
            if float( inference_transformer["contrast"] ) != 1.0 :
                image = ImageEnhance.Contrast(image).enhance(float( inference_transformer["contrast"] ))


        ori_image = cv2.cvtColor(np.array(ori_image), cv2.COLOR_RGB2BGR)
        image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


        end = int(round(time.time() * 1000))


        # start = int(round(time.time()*1000))
        outputs = predict(image, inference_threshold, target_width, target_height, min_area_sizes)




        end = int(round(time.time() * 1000))

        print("predict image: ", end - start)

        return outputs, ori_image, image, int(round((read_end-read_start)*1000))


app = flask.Flask(__name__)
CORS(app)


@app.route("/api/alive", methods=["GET"])
def alive():
    return "ok"


@app.route("/api/infer", methods=["POST"])
def infer():
    try:
        global has_device, context,  csv_file, inference_threshold, target_width, target_height
        print(request)
        if( has_processor ):
            post_request(request)
        js = request.json
        print(js)
        # if( os.path.exists(pre_processor)):
        #    js = pre_process( js )
        # device = js["device"]
        image_url = js["inputPath"]
        output_url = js["outputPath"]
        device = None
        if( js.get("deviceNo") ):
            device = js["deviceNo"]
        print(image_url)
        print(output_url)
        print(device)

        start = int(round(time.time() * 1000))

        inference_transfomer = None
        transformers = load_template( csv_file )
        if ( len( transformers ) > 0 ):
            for row in transformers:
                if( device is None ):
                    if (re.search(row["filename_matching"], os.path.basename(image_url)) != None ):
                        print("Matched " + row["filename_matching"] + ": " + image_url)
                        inference_transfomer = row
                        break
                else:
                    if (re.search(row["filename_matching"], os.path.basename(image_url)) != None and has_device and row["device"] != "" and  re.search(row["device"], device) != None ):
                        print("Matched " + row["filename_matching"] + ": " + image_url + " with device: " + row["device"] )
                        inference_transfomer = row
                        print( row )
                        break
            if( inference_transfomer is None ):
                for row in transformers:
                    if (re.search(row["filename_matching"], os.path.basename(image_url)) != None and row["device"] == "" ):
                        print("Matched " + row["filename_matching"] + ": " + image_url )
                        inference_transfomer = row
                        break

        h_roi = horizontal_roi
        v_roi = vertical_roi

        if( inference_transfomer is not None ):
            if( has_h_roi and  inference_transfomer["h_roi" ] is not None and inference_transfomer["h_roi" ] != "" and  float(inference_transfomer["h_roi" ]) > 0 ):
                h_roi = float(inference_transfomer["h_roi" ])
            if( has_v_roi and inference_transfomer["v_roi" ] is not None  and inference_transfomer["v_roi" ] != "" and float(inference_transfomer["v_roi" ]) > 0 ):
                v_roi = float(inference_transfomer["v_roi" ])

        if( has_processor ):
            image_url, output_url, inference_transfomer = pre_inference(   image_url, output_url,inference_transfomer, js )


        scoring_result, ori, img, read_duration = score_image(model, image_url, output_url,inference_transfomer,inference_threshold, target_width, target_height )
        if( has_processor ):
            scoring_result = post_inference( scoring_result )



        filename = os.path.basename( image_url )
        if( False ):
            instances = scoring_result["instances"]
            scores = instances.get_fields()["scores"].tolist()
            pred_classes = instances.get_fields()["pred_classes"].tolist()
            pred_boxes = instances.get_fields()["pred_boxes"].tensor.tolist()
            masks = np.asarray(instances.pred_masks.to('cpu').numpy())
            classes = np.asarray(instances.pred_classes.to('cpu').numpy())
        else:
            scores = scoring_result["scores"]

            pred_boxes = scoring_result["bboxes"]
            masks = scoring_result["masks"]
            classes = scoring_result["classes"]





        masks_list = []
        classes_list = []
        for mask in masks:
            #if(len(mask.polygons) > 0 ):
            #    masks_list.append(mask.polygons[0].tolist())
            #else:
            masks_list.append(mask)
        for cls in classes:
            classes_list.append(int(cls))
        # pred_classes = [0,1,2]
        # scores = [ 0.981,0.7123,0.1231]

        inference_time = int(round(time.time() * 1000)) - start
        response = {
            "scores": scores,
            "pred_classes": classes_list,
            "pred_boxes": pred_boxes,
            "pred_masks": masks_list,
            "durationInMs": inference_time,
            "outputPath": output_url, "transformersSize" : len(transformers)

        }

        masks = []
        boxes = []
        mask_bboxes = []
        box_bboxes = []
        box_colors = []
        mask_colors = []
        mask_classes = []
        pad_scores = []
        mask_scores = []

        pad_index = 0
        if (context.get("padIndex")):
            pad_index = context["padIndex"]

        name = os.path.basename(image_url)
        for i, cls in enumerate(classes):

            if (cls == pad_index):
                # drawPad( img, pred['pred_boxes'][i])
                # print("drawPad")
                boxes.append(masks_list[i])
                box_bboxes.append(pred_boxes[i])
                box_colors.append(thing_colors[cls])
                pad_scores.append( scores[i])

            else:
                # drawMask( img, pred['pred_masks'][i])
                masks.append(masks_list[i])
                mask_bboxes.append(pred_boxes[i])
                mask_colors.append(thing_colors[cls])
                mask_classes.append(cls)
                mask_scores.append(scores[i])
        if( has_processor ):
            name, ori, img, masks, boxes, mask_bboxes, box_bboxes, box_colors, mask_colors, mask_classes, response, inference_transfomer, mask_scores, pad_scores, output_url, v_roi,h_roi = pre_classify(  name, ori, img, masks, boxes,  mask_bboxes, box_bboxes, context, box_colors, mask_colors, mask_classes, response, inference_transfomer, mask_scores, pad_scores, output_url, v_roi,h_roi)

        outputImg, damage, response = drawMaskBoxesWithRoi(name, ori, img, masks, boxes, ROI, mask_bboxes, box_bboxes, context,
                                                           box_colors, mask_colors, mask_classes, response, inference_transfomer, mask_scores, pad_scores, output_url, v_roi,h_roi)

        if( has_processor ):
            outputImg, damage, response = post_classify( outputImg, damage, response )
        generate_output = True

        # cv2.imwrite( "/app/adc/test.jpg", img  )
        if (outputImg is not None):

            folder=os.path.dirname(output_url);
            os.makedirs(folder, exist_ok=True)
            output_write_start = time.time()
            cv2.imwrite(output_url, outputImg)
            output_write_end = time.time()
            response["writeDurationInMs"] = int(round((output_write_end-output_write_start )*1000))

        print(output_url)

        inference_time = int(round(time.time() * 1000)) - start
        response["readDurationInMs"] = read_duration
        response["durationInMs"] = inference_time
        print("-----------------------------------------------------------")
        print("durationInMs", inference_time)
        if(has_processor):
            response = pre_response( response )
        return jsonify(response)

    except Exception  :

        error = traceback.format_exc()

        response = {
            "pass" : False,
            "classes" : ["9999"],
            "scores" : [1.0],
            "remarks" : 'Error: {} '.format( sys.exc_info()[1] )  + "," + error



        }

        print( "Faild in response due to " , '{},\n{}'.format(sys.exc_info()[1], error ) )
        return jsonify(response)

    # shutil.copyfile( image_url, output_url)



app.run(host="0.0.0.0", port=service_port)


