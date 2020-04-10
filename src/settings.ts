/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

"use strict";
import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class VisualSettings extends DataViewObjectsParser {
  public plotOptions: plotOptions = new plotOptions();
  public labelOptions: labelOptions = new labelOptions();
  public axisOptions: axisOptions = new axisOptions();
  public legendOptions: legendOptions = new legendOptions();
  public plotColors: plotColors = new plotColors();
}

/**
* plotOptions class contains variables for plot options.
*/
export class plotOptions {
  public interpolation: string = "curveLinearClosed";
  public strokeWidth: number = 3;
  public transparency: number = 10;
  public showDataPoints: boolean = false;
  public circleRadius: number = 2;
  public dataPointColor: string = "#000";
  public showValuesDataPoints: boolean = false;
  public showAllValuesDataPoints: boolean = false;
  public plotValueColor: string = "#000";
  public noOfLevels: number = 0;
}

/**
* labelOptions class contains variables for labels.
*/
export class labelOptions {
  public fontSize: number = 12;
  public fontFamily: string = "Segoe UI";
  public fontColor: string = "#000";
}

/**
* axisOptions class contains variables for axis.
*/
export class axisOptions {
  public show: boolean = true;
  public axisColor: string = "#000";
  public strokeWidth: number = 1;
  public positionAxisLabel: string = "bottom";
}

/**
* legendOptions class contains variables for legends.
*/
export class legendOptions {
  public show: boolean = true;
  public legendPosition: string = "Top";
  public legendTitle: string = "";
  public fontSize: number = 12;
  public legendColor: string = "#000";
}

/**
* plotColors class contains variables for plot colors.
*/
export class plotColors{
  public plotColor: string = "";
}