/*
*  Power BI Visual CLI
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

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import IVisualEventService = powerbi.extensibility.IVisualEventService
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewObject = powerbi.DataViewObject;
import * as d3 from "d3";
import * as _ from "lodash";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import { legend, legendInterfaces, OpacityLegendBehavior, axisInterfaces, axisScale, axis } from "powerbi-visuals-utils-chartutils";
import ILegend = legendInterfaces.ILegend;
import LegendPosition = legendInterfaces.LegendPosition;
import LegendData = legendInterfaces.LegendData;
import createLegend = legend.createLegend;
import LegendDataPoint = legendInterfaces.LegendDataPoint;
import ISelectionManager = powerbi.extensibility.ISelectionManager
import ISelectionId = powerbi.extensibility.ISelectionId;
// powerbi.extensibility.utils.svg
import * as SVGUtil from "powerbi-visuals-utils-svgutils";
import ClassAndSelector = SVGUtil.CssConstants.ClassAndSelector;
import createClassAndSelector = SVGUtil.CssConstants.createClassAndSelector;
import IMargin = SVGUtil.IMargin;
const LegendItems: ClassAndSelector = createClassAndSelector("legendItem");
const LegendTitle: ClassAndSelector = createClassAndSelector("legendTitle");
// powerbi.extensibility.utils.interactivity
import { interactivityBaseService as interactivityService, interactivitySelectionService } from "powerbi-visuals-utils-interactivityutils";
import appendClearCatcher = interactivityService.appendClearCatcher;
import IInteractiveBehavior = interactivityService.IInteractiveBehavior;
import IInteractivityService = interactivityService.IInteractivityService;
import { createTooltipServiceWrapper, TooltipEventArgs, ITooltipServiceWrapper, TooltipEnabledDataPoint, TooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import IColorPalette = powerbi.extensibility.IColorPalette;
import { valueFormatter as ValueFormatter, valueFormatter } from "powerbi-visuals-utils-formattingutils";
import IValueFormatter = valueFormatter.IValueFormatter;
import { VisualSettings } from "./settings";
import { Constants } from "./constants";
import { csvParse } from "d3";
const constants = new Constants();
interface DataPoint {
    axis: string;
    value: number
}

export class Visual implements IVisual {
    private events: IVisualEventService;
    private target: HTMLElement;
    private updateCount: number;
    private settings: VisualSettings;
    private textNode: Text;
    private width: number;
    private height: number;
    private margin = { top: 40, right: 75, bottom: 75, left: 75 };
    private dataPoints: any[] = [];
    private dataPointsAxisValue: any[] = [];
    private categories = [];
    private measureData = [];
    private maxValues = [];
    private minValues = [];
    private minValue: number = Number.MAX_SAFE_INTEGER;
    private maxValue: number = Number.MIN_SAFE_INTEGER;
    private labelFactor: number = 1.10;
    private levels: number = 3;
    private chart: d3.Selection<SVGElement, any, HTMLElement, any>;
    private element: HTMLElement;
    private isLandingPageOn: boolean;
    private LandingPageRemoved: boolean;
    private LandingPage: d3.Selection<any, any, any, any>;
    private legend: ILegend;
    private host: IVisualHost;
    private categoryDataViewCategoryColumn: any;
    private selectionManager: ISelectionManager;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private viewport: powerbi.IViewport;
    private interactivityService: IInteractivityService<LegendDataPoint>;
    private Legend: string = "Legend";
    private colors: IColorPalette;
    private legendData: LegendData;
    private radius: number;
    private positionAxisLabel: string;
    private measureValues: any;
    private measureFormat: any = [];
    private radarStroke: any;
    private radarArea: any;
    private angleSlice: number;
    private radarWrapper: any;
    private legendItems: any;
    private categoryQueryName: any;
    private categoryDisplayName: any;
    private valueFornull = '(Blank)';
    private metadataColumns: any;
    private erroredMeasureIndex: number;
    private negativeScaleFlag: boolean = false;
    private negativeScaleIndexes: any[] = [];
    private highlightedElementIndex = -1;
    private defaultNumericFormat = ValueFormatter.DefaultNumericFormat;
    private radarDataPoints: any;
    private lastRadarWrapper: any;
    private globalDisplayName: string = "";

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipServiceWrapper = createTooltipServiceWrapper(
            options.host.tooltipService,
            options.element);
        this.legend = createLegend(
            options.element,
            false,
            this.interactivityService,
            true);
    }

    public update(options: VisualUpdateOptions) {
        try {
            this.events.renderingStarted(options);
            this.removeElements();
            if (this.handleLandingPage(options)) {
                return;
            }
            this.viewport = options.viewport;
            this.initializeSettings(options);
            if (!this.createData(options.dataViews[0])) {
                d3.select(".landingPage").remove();
                let viewportWidth = options.viewport.width;
                let viewportHeight = options.viewport.height;
                let erroredMeasureColumnName = options.dataViews[0].categorical.values[this.erroredMeasureIndex].source.displayName;
                let parentElement = d3.select(this.target).append("div").classed("landingPage", true).style("width", viewportWidth + "px").style("height", viewportHeight + "px");
                parentElement.append("p").classed("landingPageError", true).text(erroredMeasureColumnName + " is not a measure data");
                d3.select(".legend").style("display", "none");
                return;
            }
            this.width = this.viewport.width - this.margin.left - this.margin.right;
            this.height = this.viewport.height - this.margin.top - this.margin.bottom;
            this.positionAxisLabel = this.settings.axisOptions.positionAxisLabel;
            let values = options.dataViews[0].categorical.values;
            values.forEach((d, i) => {
                let format = valueFormatter.create({
                    format: values[i].source.format
                });
                let measureFormat = { "name": d.source.displayName, "format": format }
                this.measureFormat.push(measureFormat);
            });

            let root = d3.select(this.target).append("div").classed("chart", true);
            let legendOptions = this.settings.legendOptions;
            if (legendOptions.show) {
                this.legendData = Visual.createLegend(this.host, this.colors, this.settings, this.categories, this.categoryDataViewCategoryColumn, this.valueFornull);
                this.renderLegend();
                if (this.width <= constants.minWidthHeight || this.height <= constants.minWidthHeight)
                    d3.select(".chart").style("height", this.viewport.height + "px")
                if (legendOptions.legendPosition == "Left" || legendOptions.legendPosition == "Right" || legendOptions.legendPosition == "LeftCenter" || legendOptions.legendPosition == "RightCenter") {
                    d3.select(".chart").style("text-align", "left")
                    this.width -= <number><any>d3.select(".legend").attr("width");
                    if (this.width < 0) {
                        return;
                    }
                }
            }
            if (this.width < 0 || this.height < 0) {
                return;
            }
            this.plotRadar();
            //hide first tick mark from axes
            if (!this.negativeScaleFlag) {
                this.chart.selectAll(".tick")
                    .filter((d) => { return d === 0; })
                    .remove();
            }
            else {
                d3.selectAll(".axis").select("g").select(".tick").remove();
            }
            this.addFormattingToScaleValues();
            this.checkWidthOfAxisLabels(options.dataViews[0]);
            this.checkWidthOfAxisLabels(options.dataViews[0]);
            for (let iterator = 0; iterator < this.dataPoints.length; iterator++) {
                this.addTooltip(d3.select("#value-" + iterator + " .radarArea"), iterator);
            }
            this.showContextMenu(root);
            this.radarArea = d3.selectAll(".radarArea");
            this.radarStroke = d3.selectAll(".radarStroke");
            d3.select(".radar").on("click", (event) => {
                this.clearSelection();
            })
            d3.select('#legendGroup').on('click', () => {
                this.legendInteractivity();
            });
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options);
        }
    }

    /**
     * Initializes tooltip values
     */
    public addTooltip(element, iterator) {
        let categoryFormatter = valueFormatter.create({
            format: this.categoryDataViewCategoryColumn.source.format
        })
        this.tooltipServiceWrapper.addTooltip<TooltipEnabledDataPoint>(element, (data) => {
            let tooltipArray = [];
            tooltipArray.push({
                displayName: this.categoryDisplayName,
                value: categoryFormatter.format(this.categories[iterator].value)
            })
            for (let iteratorData = 0; iteratorData < data[constants.dataIndex][constants.lengthIndex]; iteratorData++) {
                let dataIteratorData = data[constants.dataIndex][iteratorData];
                let iteratorDataValue = dataIteratorData.value % constants.one === 0 ? dataIteratorData.value : dataIteratorData.value.toFixed(2);
                let valueFormat;
                this.measureFormat.forEach((formatData) => {
                    if (formatData.name == dataIteratorData.axis) {
                        valueFormat = formatData.format;
                    }
                })
                let measureVal = valueFormat.format(Number(iteratorDataValue));
                let tooltipObject = {
                    displayName: dataIteratorData.axis,
                    value: measureVal.toString()
                }
                tooltipArray.push(tooltipObject)
            }
            return tooltipArray;
        }, (data) => { return this.dataPoints[iterator].selectionId });
    }

    /**
     * Displays contextMenu on rightClick
     */
    public showContextMenu(root) {
        root.select("svg").on('contextmenu', () => {
            const mouseEvent: MouseEvent = <MouseEvent>d3.event;
            const eventTarget: EventTarget = mouseEvent.target;
            const dataPoint: any = d3.select(d3.event.target).datum();
            if (dataPoint && dataPoint[0] && dataPoint[0].selectionId) {
                this.selectionManager.showContextMenu(dataPoint ? dataPoint[0].selectionId : {}, {
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY
                });
                mouseEvent.preventDefault();
            }
        });
    }

    /**
     * Adds formatting to scale values and datapoint values
     */
    public addFormattingToScaleValues() {
        d3.selectAll(".axis").each((d, i, nodes) => {
            let measureFormatName = d;
            d3.select(nodes[i]).selectAll("g .tick").each((data, j, textNodes) => {
                let scaleValue = Number.parseInt(d3.select(textNodes[j]).select("text").text());
                //applying formatter for each value from this.measureFormat[] array using '.axis' classed elements index
                let valueFormat;
                this.measureFormat.forEach((formatData) => {
                    if (formatData.name == measureFormatName) {
                        valueFormat = formatData.format;
                    }
                })
                let formattedScaleValue = valueFormat.format(scaleValue).toString();
                d3.select(textNodes[j]).select("text").text(formattedScaleValue)
            })
        })
        if (this.settings.plotOptions.showValuesDataPoints) {
            d3.selectAll(".radarWrapper").each((d, i, nodes) => {
                d3.select(nodes[i]).selectAll("text").each((d, j, textNodes) => {
                    let valueFormat, measureFormatName = d[`axis`];
                    this.measureFormat.forEach((formatData) => {
                        if (formatData.name == measureFormatName) {
                            valueFormat = formatData.format;
                        }
                    })
                    let scaleValue = Number.parseInt(d3.select(textNodes[j]).text());
                    let formattedScaleValue = valueFormat.format(scaleValue).toString();
                    d3.select(textNodes[j]).text(formattedScaleValue);
                })
            })
        }
    }

    /**
     * Clears SelectionManager ID, reverts fill-opacity and stroke-opacity settings to default
     */
    public clearSelection() {
        let highlightedElement = d3.select(".highlightedPlot");
        if (highlightedElement) {
            highlightedElement.remove();
            this.radarWrapper.style("display", "block")
        }
        if (this.settings.plotOptions.showValuesDataPoints) {
            this.radarDataPoints.style("display", this.settings.plotOptions.showAllValuesDataPoints ? "block" : "none");
            this.lastRadarWrapper.selectAll("text").style("display", "block");
        }
        this.highlightedElementIndex = -1;
        this.selectionManager.clear();
        this.radarWrapper.style("opacity", constants.fullTransparencyDecimal);
        this.legendItems.style('fill-opacity', constants.fullTransparencyDecimal);
        this.radarArea.style('fill-opacity', (Math.abs((this.settings.plotOptions.transparency) - constants.fullTransparencyDecimal)));
        this.radarStroke.style('stroke-opacity', constants.fullTransparencyDecimal);
    }

    /**
     *  Adds interactivity for legends
     */
    public legendInteractivity() {
        this.legendItems = d3.selectAll(".legendItem");
        this.radarWrapper = d3.selectAll(".radarWrapper");
        this.legendItems.on("click", (d, i, nodes) => {
            let index: number;
            for (let iterator = 0; iterator < this.dataPoints.length; iterator++) {
                if (d.tooltip == this.dataPoints[iterator].category) {
                    index = iterator;
                    break;
                }
            }
            if (!index) {
                index = i;
            }
            this.createHighlightPlot(index);
            this.selectionManager.select(this.dataPoints[index].selectionId).then((ids: ISelectionId[]) => {
                this.legendItems.style(
                    'fill-opacity', ids.length > 0 ? constants.crossFilterOpacity : constants.fullTransparencyDecimal
                );
                this.radarWrapper.style(
                    'opacity', ids.length > 0 ? constants.crossFilterOpacity : constants.fullTransparencyDecimal
                )
                d3.select(nodes[i]).style(
                    'fill-opacity', constants.fullTransparencyDecimal
                );
                d3.select("#value-" + index).style("opacity", constants.fullTransparencyDecimal)
            });
        })
    }
    /**
     * Creates a radarWrapper with highlightedPlot class on cross-filtering any plot
     *  @param {number} index: index object 
     */
    public createHighlightPlot(index) {
        let highlightedElement = d3.select(".highlightedPlot");
        if (highlightedElement) {
            highlightedElement.remove();
            this.radarWrapper.style("display", "block");
        }
        d3.select(".highlightedPlot").remove();
        this.radarWrapper.style("display", "block");
        let clone = (selector) => {
            var node = d3.select(selector).node();
            // returns the reference of the recreated plot element
            return d3.select(node.parentNode.insertBefore(node.cloneNode(true), node.parentNode.lastChild));
        }
        let copy = clone("#value-" + index).attr("id", null).classed("highlightedPlot", true);
        d3.select("#value-" + index).style("display", "none");
        let highlightedPlot = d3.select(".highlightedPlot");
        if (this.settings.plotOptions.showValuesDataPoints) {
            this.radarDataPoints.style("display", this.settings.plotOptions.showAllValuesDataPoints ? "block" : "none");
            highlightedPlot.selectAll("text").style("display", "block");
        }
        highlightedPlot.style("opacity", constants.fullTransparencyDecimal)
        highlightedPlot = highlightedPlot.select(".radarArea");
        highlightedPlot.datum(this.dataPointsAxisValue[index])
        this.addTooltip(highlightedPlot, index);
        this.highlightedElementIndex = index;
    }

    /**
     * Initializes settings with appropriate range of values
     *
     * @param {VisualUpdateOptions} options: VisualUpdateOptions object 
     */
    public initializeSettings(options) {
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        let plotOptions = this.settings.plotOptions;
        plotOptions.strokeWidth = Math.max(0, plotOptions.strokeWidth);
        plotOptions.strokeWidth = Math.min(constants.maxStrokeWidth, plotOptions.strokeWidth);
        plotOptions.transparency = plotOptions.transparency / constants.transparencyMultiple;
        plotOptions.circleRadius = Math.max(0, plotOptions.circleRadius);
        plotOptions.circleRadius = Math.min(constants.maxCircleRadius, plotOptions.circleRadius);
        let axisOptions = this.settings.axisOptions;
        axisOptions.strokeWidth = Math.max(constants.minAxisStrokeWidth, axisOptions.strokeWidth);
        axisOptions.strokeWidth = Math.min(constants.maxStrokeWidth, axisOptions.strokeWidth);
        let currentName: string = options.dataViews[0].categorical.categories[0].source.displayName;
        currentName = currentName == "" || currentName == null ? this.valueFornull : currentName;
        let legendOptions = this.settings.legendOptions;
        if (this.globalDisplayName != currentName) {
            this.globalDisplayName = currentName;
            legendOptions.legendTitle = "";
        }
        legendOptions.legendTitle = legendOptions.legendTitle == "" ? currentName : legendOptions.legendTitle
    }

    /**
     * Checks the width of axis labels and decreases scale if necessary
     *
     * @param {DataView} dataView: Dataview object 
     */
    private checkWidthOfAxisLabels(dataView) {
        d3.selectAll(".axis").each((d, i, nodes) => {
            let axisLabelWidth;
            if (!this.negativeScaleFlag) {
                // width of maximum scale value is stored using textLength.baseVal.value
                axisLabelWidth = d3.select(nodes[i]).select("g .tick:last-child text")["_groups"][0][0].textLength.baseVal.value;
            }
            else {
                // width of minimum -ve scale value is stored using textLength.baseVal.value
                let noOfElements = axisLabelWidth = d3.select(nodes[i]).selectAll("g .tick text")["_groups"][0].length;
                axisLabelWidth = noOfElements > 1 ? d3.select(nodes[i]).selectAll("g .tick text")["_groups"][0][1].textLength.baseVal.value : d3.select(nodes[i]).selectAll("g .tick text")["_groups"][0][0].textLength.baseVal.value;
            }
            let measureDataLength = d3.select(nodes[i]).selectAll("g .tick").size() + 1;

            if (axisLabelWidth > this.radius / measureDataLength) {
                d3.select(nodes[i]).selectAll("g .tick:nth-child(even)").remove();
            }
        });
    }

    /**
     * Displays landing page on load
     *
     * @param {VisualUpdateOptions} options: VisualUpdateOptions object 
     */
    private handleLandingPage(options: VisualUpdateOptions) {
        d3.select(".landingPage").remove();
        let viewportWidth = options.viewport.width;
        let viewportHeight = options.viewport.height;
        let dataViews = options.dataViews;
        let parentElement = d3.select(this.target).append("div").classed("landingPage", true).style("width", viewportWidth + "px").style("height", viewportHeight + "px");
        if (!dataViews || !dataViews.length) {
            parentElement.append("h3").text(constants.nameOfVisual);
            parentElement.append("p").text(constants.landingPageDescription);
            d3.select(".legend").style("display", "none");
            return true;
        }
        else if (!dataViews[0].categorical.categories || !dataViews[0].categorical.values || dataViews[0].categorical.values.length < constants.minDataValues) {
            parentElement.append("p").classed("landingPageError", true).text(constants.landingPageText);
            d3.select(".legend").style("display", "none");
            return true;
        }
        else {
            parentElement.remove();
            d3.select(".legend").style("display", "block");
            return false;
        }
    }

    /**
     * Creates data structures suitable for plotting values
     *
     * @param {DataView} dataView: Dataview object 
     */
    public createData(dataView) {
        this.dataPoints = [];
        this.categories = [];
        this.maxValues = [];
        this.minValues = [];
        this.categoryDataViewCategoryColumn = dataView.categorical.categories[0];
        this.categoryQueryName = dataView.categorical.categories[0].source.queryName;
        this.categoryDisplayName = dataView.categorical.categories[0].source.displayName;
        this.measureValues = dataView.categorical.values;
        this.categories = dataView.categorical.categories[0].values.map((value, i) => {
            const defaultColor: any = {
                solid: {
                    color: this.host.colorPalette.getColor(<string><any>i).value
                }
            };
            return {
                color: this.getCategoricalObjectValue<any>(this.categoryDataViewCategoryColumn, i, 'plotColors', 'plotColor', defaultColor).solid.color,
                value: value == "" || value == null ? this.valueFornull : value
            }
        })
        // There should be atleast 3 measures to plot radar
        if (this.measureValues.length >= constants.minDataValues) {
            this.metadataColumns = dataView.metadata.columns;
            for (let iterator = 0; iterator < this.metadataColumns.length; iterator++) {
                if (this.metadataColumns[iterator].roles.measure) {
                    this.measureData.push(this.metadataColumns[iterator].displayName);
                }
            }
            this.measureData.map((d) => {
                return this.maxValues[d] = this.maxValue;
            });
            this.measureData.map((d) => {
                return this.minValues[d] = this.minValue;
            });
            let measureValuesLength = this.measureValues[0].values.length;
            for (let iterValues = 0; iterValues < measureValuesLength; iterValues++) {
                let plotPoint = {};
                for (let iterator = 0; iterator < this.measureValues.length; iterator++) {
                    let displayName = this.measureValues[iterator].source.displayName;
                    this.measureValues[iterator].source.displayName = displayName == "" || displayName == null ? 0 : displayName;
                    if ((!this.measureValues[iterator].source.type.numeric)) {
                        this.erroredMeasureIndex = iterator;
                        return false;
                    }
                    plotPoint[displayName] = this.measureValues[iterator].values[iterValues] == "" || this.measureValues[iterator].values[iterValues] == null ? 0 : this.measureValues[iterator].values[iterValues];
                    this.maxValues[displayName] = Math.max(this.maxValues[displayName], this.measureValues[iterator].values[iterValues])
                    this.minValues[displayName] = Math.min(this.minValues[displayName], this.measureValues[iterator].values[iterValues])
                }
                plotPoint["selectionId"] = this.host.createSelectionIdBuilder()
                    .withCategory(this.categoryDataViewCategoryColumn, iterValues)
                    .createSelectionId()
                plotPoint["category"] = this.categoryDataViewCategoryColumn.values[iterValues] == "" || this.categoryDataViewCategoryColumn.values[iterValues] == null ? 0 : this.categoryDataViewCategoryColumn.values[iterValues];
                this.dataPoints.push(plotPoint);
            }
        }
        return true;
    }

    /**
     * Creates scales for each axis separately
     * 
     */
    public generateScales() {
        let plotObject = {};
        this.measureData.map((i) => {
            let axisData = this.dataPoints.map((row) => {
                return row[i];
            });
            let scale, axis;
            let max = d3.max(this.dataPoints, (a) => { return a[i]; });
            let min = d3.min(this.dataPoints, (a) => { return a[i]; });
            if (min >= 0) {
                min = 0;
            }
            else {
                this.negativeScaleFlag = true;
                this.negativeScaleIndexes.push(i);
                min = min + (min * constants.scaleMultiple);
            }
            //extending scale by 10% to clearly visualize plot
            if (!this.negativeScaleFlag) {
                max = max + (max * constants.scaleMultiple);
            }
            scale = d3.scaleLinear()
                .domain([min, max]);
            if (this.positionAxisLabel == "bottom") {
                axis = d3.axisBottom(scale)
            }
            else if (this.positionAxisLabel == "top") {
                axis = d3.axisTop(scale)
            }
            axis.ticks(5).tickFormat((d, i) => { if (i != 0) { return d + ""; } else { return ""; } });
            this.settings.axisOptions.strokeWidth > 3 ? axis.tickSizeOuter(3) : axis.tickSizeOuter(0);
            plotObject[i] = {};
            plotObject[i].scale = scale;
            plotObject[i].axis = axis;

        });
        return plotObject;
    }

    /**
     * Removes all the elements from main container
     * 
     */
    public removeElements() {
        this.measureData = [];
        this.categories = [];
        d3.select(".chart").remove();
        d3.selectAll(LegendItems.selectorName).remove();
        d3.selectAll(LegendTitle.selectorName).remove();
        this.negativeScaleFlag = false;
        this.negativeScaleIndexes = [];
        this.measureFormat = [];
    }

    /**
     * Create legends with datapoint values
     *
     * @param {DataView} dataView: Dataview object 
     */
    private static createLegend(host: IVisualHost,
        colorPalette: IColorPalette,
        settings: VisualSettings,
        categories,
        categoryDataViewCategoryColumn,
        valuesForNull): LegendData {
        let displayName = categoryDataViewCategoryColumn.source.displayName;
        const legendData: LegendData = {
            fontSize: settings.legendOptions.fontSize,
            dataPoints: [],
            title: settings.legendOptions.legendTitle,
            labelColor: settings.legendOptions.legendColor
        };
        let categoryFormatter = valueFormatter.create({
            format: categoryDataViewCategoryColumn.source.format
        })
        legendData.dataPoints = categoryDataViewCategoryColumn.values.map(
            (dataPoint, i): LegendDataPoint => {
                let color: string = settings.legendOptions.legendColor;
                return {
                    label: (dataPoint == "" || dataPoint == null) ? valuesForNull : categoryFormatter.format(dataPoint),
                    color: categories[i].color,
                    identity: host.createSelectionIdBuilder()
                        .withCategory(categoryDataViewCategoryColumn, i)
                        .createSelectionId(),
                    selected: false
                };
            });
        return legendData;
    }

    /**
     * Renders legend's to the main container
     */
    private renderLegend(): void {
        if (!this.legendData) {
            return;
        }
        let position: LegendPosition = LegendPosition[this.settings.legendOptions.legendPosition];
        this.legend.changeOrientation(position);
        this.legend.drawLegend(this.legendData, _.clone(this.viewport));
        let rootElement = d3.select(".chart");
        legend.positionChartArea(rootElement, this.legend);
        switch (this.legend.getOrientation()) {
            case LegendPosition.Left:
            case LegendPosition.LeftCenter:
            case LegendPosition.Right:
            case LegendPosition.RightCenter:
                this.viewport.width -= this.legend.getMargins().width;
                break;
            case LegendPosition.Top:
            case LegendPosition.TopCenter:
            case LegendPosition.Bottom:
            case LegendPosition.BottomCenter:
                this.viewport.height -= this.legend.getMargins().height;
                break;
        }
    }

    /**
     * Radar chart is plotted based on the data
     * 
     */
    public plotRadar() {
        let plotObject = this.generateScales();
        //generateScales() returns scale and axis of every measure based on the data in this.measureData
        let scales = this.measureData.map((k) => { return plotObject[k].scale; });
        let axes = this.measureData.map((k) => { return plotObject[k].axis; });
        let dataPoints = this.dataPoints.map((row) => {
            return this.measureData.map((key, i) => {
                return {
                    "axis": key,
                    "value": row[key],
                    "selectionId": row.selectionId
                };
            });
        });
        this.dataPointsAxisValue = dataPoints;
        //The number of different axes
        let total = this.measureData.length;
        //Radius of the outermost circle
        this.radius = Math.min(this.width / 2, this.height / 2);
        //The width in radians of each category
        this.angleSlice = Math.PI * 2 / total;
        scales = scales.map((i) => {
            return i.range([0, this.radius]);
        });
        this.chart = d3.select(".chart").append("svg")
            .attr("width", this.width + this.margin.left + this.margin.right)
            .attr("height", this.height + this.margin.top + this.margin.bottom)
            .attr("class", "radar");
        let g = this.chart.append("g")
            .attr("transform", "translate(" + (this.width / 2 + this.margin.left) + "," + (this.height / 2 + this.margin.top) + ")");
        let levelsWrapper = g.append("g").classed("levelsWrapper", true).selectAll(".levels")
            .data(d3.range(1, total + 1))
            .enter()
            .append("circle")
            .attr("class", "gridCircle")
            .attr("r", d => this.radius / total * d)
        let filter = g.append('defs').append('filter').attr('id', 'bgEffect');
        //feGaussianBlur creates blur effect
        let feGaussianBlur = filter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'coloredBlur');
        let feMerge = filter.append('feMerge');
        //feMergeNode takes the filter properties from feMerge
        let feMergeNode_1 = feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        let feMergeNode_2 = feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
        //The radial line function
        let radarLine = d3.lineRadial()
            .radius((d, i) => { return scales[i](d[`value`]); })
            .angle((d, i) => { return i * this.angleSlice; });
        switch (this.settings.plotOptions.interpolation) {
            case "curveLinearClosed":
                radarLine.curve(d3.curveLinearClosed);
                break;
            case "curveCardinalClosed":
                radarLine.curve(d3.curveCardinalClosed);
                break;
            case "curveBundle":
                radarLine.curve(d3.curveBundle);
                break;
            case "curveBasisClosed":
                radarLine.curve(d3.curveBasisClosed);
                break;
            case "curveNatural":
                radarLine.curve(d3.curveNatural);
                break;
        }
        this.plotValuesAndElements(radarLine, g, scales);
        this.drawAxes(scales, axes, g);
        this.legendInteractivity();
        if (!this.settings.axisOptions.show) {
            d3.selectAll(".axis g").attr("display", "none")
        }
        else {
            d3.selectAll(".axis g").attr("display", "block")
        }
        if (this.settings.plotOptions.showValuesDataPoints) {
            let axis = d3.selectAll(".axis")
            axis.selectAll("path").style("opacity", constants.axisOpacityOnDataPoints);
            axis.selectAll("g .tick").attr("display", "none")
        }
        let axisOptions = this.settings.axisOptions;
        d3.selectAll("path.domain, .tick line").attr("stroke", axisOptions.axisColor).attr("stroke-width", axisOptions.strokeWidth)
        d3.selectAll(".tick text").attr("fill", axisOptions.axisColor)
    }

    /**
     * Adds ellipses to categoryLabels
     *  @param {any} textObj: textObj object 
     *  @param {any} remWidth: remWidth object
     *  @param {string} labelText: labelText object
     */
    public addEllipsesToLabel(textObj, remWidth, labelText) {
        let boxWidth = Number.parseInt(textObj.getSubStringLength(0, textObj.getBBox().width));
        remWidth = Number.parseInt(remWidth);
        if (boxWidth >= remWidth) {
            for (let x = textObj.getBBox().width - 3; x > 0; x -= 3) {
                let subStringLength = textObj.getSubStringLength(0, x);
                if (subStringLength <= remWidth) {
                    labelText = labelText.substring(0, x) + "...";
                    return labelText;
                }
            }
            return "...";
        }
    }

    /**
     * Draws axes with axes labels
     *  @param {any} scales: scales object 
     *  @param {any} axes: axes object 
     *  @param {any} g: g object 
     */
    public drawAxes(scales, axes, g) {
        let axisGrid = g.append("g").attr("class", "axisWrapper");
        //Create the straight lines radiating outward from the center
        let axis = axisGrid.selectAll(".axis")
            .data(this.measureData)
            .enter()
            .append("g")
            .attr("class", "axis");
        //Append the axes
        let axisGroup = axis.append("g")
            .attr("transform", (d, i) => { return "rotate(" + (constants.deg180 / Math.PI * (i * this.angleSlice) + constants.deg270) + ")"; })
            .each(function (d, i) {
                let ax = axes[i];
                ax(d3.select(this));
            })
        //Append axis category labels
        let emptyAxis = [];
        axis.append("text")
            .attr("class", "categoryLabels")
            .style("font-size", this.settings.labelOptions.fontSize)
            .attr("text-anchor", "start")
            .attr("dy", "0.35em")
            /*
            * The polar coordinates r and φ can be converted to the Cartesian coordinates x and y by using the trigonometric functions sine and cosine.
            * Reference: https://en.wikipedia.org/wiki/Polar_coordinate_system
            * 
            * Category labels distance depend on "labelFactor" value
            * 
            * x = rcos0
            * y = rsin0
            */
            .attr("x", (d, i) => {
                return ((this.radius * this.labelFactor) * Math.cos(this.angleSlice * i - Math.PI / 2));
            })
            .attr("y", (d, i) => {
                return ((this.radius * this.labelFactor) * Math.sin(this.angleSlice * i - Math.PI / 2));
            })
            .text((d, i) => { return d; })
            .style("font-family", this.settings.labelOptions.fontFamily)
            .style("fill", this.settings.labelOptions.fontColor)

        for (let emptyAxisIter = 0; emptyAxisIter < emptyAxis.length; emptyAxisIter++) {
            d3.select(axis.nodes()[emptyAxis[emptyAxisIter]]).select(".categoryLabels").remove();
        }
        axis.selectAll('.categoryLabels').each((d, i, nodes) => {
            let element = d3.select(nodes[i])[`_groups`][0][0];
            let xDist = element.getBBox().x;
            let labelText = element.__data__;
            let remWidth = this.viewport.width / 2 - Math.abs(element.getBBox().x) - 5;
            if (remWidth < element.getBBox().width) {
                let textObj = element;
                let labelTextEllipsize = this.addEllipsesToLabel(textObj, remWidth, labelText);
                d3.select(nodes[i]).text(labelTextEllipsize)
            } else {
                d3.select(nodes[i]).text(labelText)
            }
            d3.select(nodes[i]).append("title").text(labelText)
        })

        // set text-anchor value based on the angle
        d3.selectAll(".axisWrapper .axis").each((d, i, nodes) => {
            let value = d3.select(nodes[i]).select("g").attr("transform");
            value = value.split("(")[1].split(")")[0];
            let element = d3.select(nodes[i]);
            if (<number><any>value > constants.deg450) {
                element.select(".categoryLabels").attr("text-anchor", "end")
                element.selectAll(".tick text").attr("transform", "rotate(-180)")
                element.selectAll(".tick line").attr("transform", "rotate(-180)")
            }
            else if (<number><any>value == constants.deg270 || <number><any>value == constants.deg450) {
                d3.select(nodes[i]).select(".categoryLabels").attr("text-anchor", "middle")
            }
        });

    }

    /**
     * Plot radarWrappers and path elements for the radar plots
     *  @param {any} radarLine: radarLine object 
     *  @param {any} g: g object 
     *  @param {any} scales: scales object 
     */
    public plotValuesAndElements(radarLine, g, scales) {
        let blobWrapper = this.chart.select("g").selectAll(".radarWrapper")
            .data(this.dataPointsAxisValue)
            .enter().append("g")
            .attr("class", "radarWrapper")
            .attr("id", (d, i) => {
                return "value-" + i;
            })
            .on("click", (d, i) => {
                d3.event.stopPropagation();
            })
        blobWrapper
            .append("path")
            .attr("class", "radarArea")
            .attr("d", (d, i) => { return radarLine(d); })
            .style("fill", (d, i) => { return this.categories[i].color })
            .style("fill-opacity", (Math.abs((this.settings.plotOptions.transparency) - constants.fullTransparencyDecimal)))
            .on("click", (data, i, event) => {
                this.radarArea = d3.selectAll(".radarWrapper .radarArea");
                this.radarStroke = d3.selectAll(".radarWrapper .radarStroke");
                let index;
                let legendGroup = d3.select("#legendGroup").selectAll(".legendItem");
                legendGroup.each((d, j, nodes) => {
                    if (d[`tooltip`] == this.dataPoints[i].category) {
                        index = j;
                        return;
                    }
                })
                if (!index) {
                    index = i;
                }
                this.createHighlightPlot(index);
                this.selectionManager.select(this.dataPoints[i].selectionId).then((ids: any) => {
                    this.radarWrapper.style(
                        'opacity', ids.length > 0 ? constants.crossFilterOpacity : constants.fullTransparencyDecimal
                    )
                    this.legendItems.style(
                        'fill-opacity', ids.length > 0 ? constants.crossFilterOpacity : constants.fullTransparencyDecimal
                    );
                    d3.select("#value-" + i).style("opacity", constants.fullTransparencyDecimal)
                    let legend = d3.selectAll("#legendGroup g.legendItem").nodes()[index];
                    d3.select(legend).style("fill-opacity", 1);
                });
            })

        //Create the outlines
        blobWrapper.append("path")
            .attr("class", "radarStroke")
            .attr("d", (d, i) => { return radarLine(d); })
            .style("stroke-width", this.settings.plotOptions.strokeWidth + "px")
            .style("stroke", (d, i) => { return this.categories[i].color })
            .style("fill", "none");
        if (this.settings.plotOptions.showDataPoints) {
            blobWrapper.selectAll(".radarCircle")
                .data((d, i) => { return d; })
                .enter().append("circle")
                .attr("class", "radarCircle")
                .attr("r", this.settings.plotOptions.circleRadius)
                /*
                * The polar coordinates r and φ can be converted to the Cartesian coordinates x and y by using the trigonometric functions sine and cosine.
                * Reference: https://en.wikipedia.org/wiki/Polar_coordinate_system 
                */
                .attr("cx", (d, i) => { return scales[i](d[`value`]) * Math.cos(this.angleSlice * i - Math.PI / 2); })
                .attr("cy", (d, i) => { return scales[i](d[`value`]) * Math.sin(this.angleSlice * i - Math.PI / 2); })
                .style("fill-opacity", constants.dataValuesfillOpacity)
                .attr("fill", this.settings.plotOptions.dataPointColor);
        }
        if (this.settings.plotOptions.showValuesDataPoints) {
            this.radarDataPoints = blobWrapper.selectAll(".radarDataPoints")
                .data((d, i) => { return d; })
                .enter()
                .append("text")
                .text((d) => { return d[`value`]; })
                .attr("x", (d, i) => {
                    let xScale = scales[i](d[`value`]) * Math.cos(this.angleSlice * i - Math.PI / 2);
                    return isNaN(xScale) ? 0 : xScale;
                })
                .attr("y", (d, i) => {
                    let yScale = scales[i](d[`value`]) * Math.sin(this.angleSlice * i - Math.PI / 2)
                    return isNaN(yScale) ? 0 : yScale;
                })
                .attr("font-size", constants.radarDataPointsFontSize)
                .style("fill-opacity", constants.dataValuesfillOpacity)
                .style("font-weight", "bold")
                .style("display", this.settings.plotOptions.showAllValuesDataPoints ? "block" : "none")
                .style("fill", this.settings.plotOptions.plotValueColor);
            this.lastRadarWrapper = d3.select(".radarWrapper:last-child");
            this.lastRadarWrapper.selectAll("text").style("display", "block");
        }
    }

    /**
     * This function parses all settings defined in settings file and binds to the capabilities
     * @param {DataView} dataView DataView Property
     */
    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * Gets property value for a particular object in a category.
     *
     * @function
     * @param {DataViewCategoryColumn} category - List of category objects.
     * @param {number} index                    - Index of category object.
     * @param {string} objectName               - Name of desired object.
     * @param {string} propertyName             - Name of desired property.
     * @param {T} defaultValue                  - Default value of desired property.
     */

    public getCategoricalObjectValue<T>(category: DataViewCategoryColumn, index: number, objectName: string, propertyName: string, defaultValue: T): T {
        let categoryObjects = category.objects;
        if (categoryObjects) {
            let categoryObject: DataViewObject = categoryObjects[index];
            if (categoryObject) {
                let object = categoryObject[objectName];
                if (object) {
                    let property: T = object[propertyName];
                    if (property) {
                        return property;
                    }
                }
            }
        }
        return defaultValue;
    }

    /**
     *
     * @param {VisualObjectInstance[]} objectEnumeration - List of category objects.
     * @param {number} index                    - Index of category object.
     */
    private enumeratePlotOptions(objectEnumeration, options) {
        let plotOptions = this.settings.plotOptions;
        if (plotOptions.showDataPoints && plotOptions.showValuesDataPoints) {
            objectEnumeration.push({
                objectName: options.objectName,
                properties: {
                    interpolation: plotOptions.interpolation,
                    strokeWidth: plotOptions.strokeWidth,
                    transparency: plotOptions.transparency * constants.transparencyMultiple,
                    showDataPoints: plotOptions.showDataPoints,
                    circleRadius: plotOptions.circleRadius,
                    dataPointColor: plotOptions.dataPointColor,
                    showValuesDataPoints: plotOptions.showValuesDataPoints,
                    showAllValuesDataPoints: plotOptions.showAllValuesDataPoints,
                    plotValueColor: plotOptions.plotValueColor
                },
                selector: null
            });
        }
        else if (plotOptions.showValuesDataPoints) {
            objectEnumeration.push({
                objectName: options.objectName,
                properties: {
                    interpolation: plotOptions.interpolation,
                    strokeWidth: plotOptions.strokeWidth,
                    transparency: plotOptions.transparency * constants.transparencyMultiple,
                    showDataPoints: plotOptions.showDataPoints,
                    showValuesDataPoints: plotOptions.showValuesDataPoints,
                    showAllValuesDataPoints: plotOptions.showAllValuesDataPoints,
                    plotValueColor: plotOptions.plotValueColor
                },
                selector: null
            });
        }
        else if (plotOptions.showDataPoints) {
            objectEnumeration.push({
                objectName: options.objectName,
                properties: {
                    interpolation: plotOptions.interpolation,
                    strokeWidth: plotOptions.strokeWidth,
                    transparency: plotOptions.transparency * constants.transparencyMultiple,
                    showDataPoints: plotOptions.showDataPoints,
                    circleRadius: plotOptions.circleRadius,
                    dataPointColor: plotOptions.dataPointColor,
                    showValuesDataPoints: plotOptions.showValuesDataPoints,
                },
                selector: null
            });
        }
        else {
            objectEnumeration.push({
                objectName: options.objectName,
                properties: {
                    interpolation: plotOptions.interpolation,
                    strokeWidth: plotOptions.strokeWidth,
                    transparency: plotOptions.transparency * constants.transparencyMultiple,
                    showDataPoints: plotOptions.showDataPoints,
                    showValuesDataPoints: plotOptions.showValuesDataPoints,
                },
                selector: null
            });
        }
        return objectEnumeration;
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        const objectName: string = options.objectName;
        const objectEnumeration: VisualObjectInstance[] = [];
        switch (objectName) {
            case "plotOptions":
                return this.enumeratePlotOptions(objectEnumeration, options);
                break;
            case "legendOptions":
                objectEnumeration.push({
                    objectName: options.objectName,
                    properties: {
                        legendPosition: this.settings.legendOptions.legendPosition,
                        legendTitle: this.settings.legendOptions.legendTitle,
                        fontSize: this.settings.legendOptions.fontSize,
                        legendColor: this.settings.legendOptions.legendColor,
                    },
                    selector: null
                });
                break;
            case 'plotColors':
                let categoryFormatter = valueFormatter.create({
                    format: this.categoryDataViewCategoryColumn.source.format
                })
                for (const [i, category] of this.categories.entries()) {
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: categoryFormatter.format(category.value),
                        properties: {
                            plotColor: {
                                solid: {
                                    color: category.color
                                }
                            }
                        },
                        selector: this.dataPoints[i].selectionId.getSelector()
                    });
                }
                return objectEnumeration;
                break;
            case 'axisOptions':
                if (this.settings.plotOptions.showValuesDataPoints) {
                    return objectEnumeration;
                }
            default: break;
        }
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }
}