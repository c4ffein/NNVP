/**
 * Chartist.js plugin to display nice tooltips -
 * inspired by plugin from chriha, heavily modified by c4ffein
 *
 * changes from chriha:
 * - instanciates after chart
 * - removed jQuery dependency
 * - works on data updates
 *
 * todos:
 * - better algorithm for selecting pointData on mousemove
 * - smooth move - keep the same tip
 *
 * bugs:
 * - inconsistent behaviour if missing data on some lines
 * - need line values to be set by user, default colors from Chartist aren't used
 * - untested on other types than lines
 */

export default function (window, document, Chartist) {
  const defaultOptions = {
    title: ':title',
    columns: { title: 'title', value: 'value' },
    chartType: null,
  };

  const getChartType = (chart) => {
    if (chart instanceof Chartist.Line) return 'line';
    if (chart instanceof Chartist.Bar) return 'bar';
    if (chart instanceof Chartist.Pie) return 'pie';
    return 'undefined';
  };

  Chartist.plugins = Chartist.plugins || {}; // eslint-disable-line no-param-reassign

  Chartist.plugins.ctTip = (userOptions) => { // eslint-disable-line no-param-reassign
    const options = Chartist.extend({}, defaultOptions, userOptions);
    let chartData = null;
    const length = 0;

    return function ctTip(chart) {
      options.chartType = getChartType(chart);

      // No support for other types than line and bar
      if (options.chartType !== 'line' && options.chartType !== 'bar') return;

      const chartElement = chart.container;
      let positions = [];
      const farLeft = 0;
      let farRight = 0;

      // Helpers
      const leftOffset = el => (el.getBoundingClientRect().left + document.body.scrollLeft);
      const topOffset = el => (el.getBoundingClientRect().top + document.body.scrollTop);
      const rightOffset = el => (el.getBoundingClientRect().right + document.body.scrollLeft);
      const getWidth = el => parseFloat(getComputedStyle(el, null).width.replace('px', ''));

      // Builds a new tooltip
      const buildTooltip = (pointData) => {
        const tipBoxWidth = 200;
        const valuesNumber = pointData.data.series.length;
        const rowHeight = 20;
        const tipBoxHeight = 25 + valuesNumber * (rowHeight + 2);
        const tip = document.createElement('div');
        tip.classList.add('ct-tip');
        tip.id = `ct-tip-${pointData.elements[0].id}`;
        const title = pointData.data.label;
        const { series } = pointData.data;
        const tipColor = 'rgba(0, 0, 0, 0.7)';

        // tbody
        const tbody = document.createElement('tbody');
        series.forEach((dataRow, index) => {
          const tbodyThColor = document.createElement('th');
          const tbodyThColorContainer = document.createElement('div');
          const tbodyThColorDrop = document.createElement('div');

          // Get line color : warning : can be transparent
          const lineColor = window.getComputedStyle(pointData.elements[index]).stroke;

          tbodyThColorContainer.style['background-color'] = 'rgb(255,255,255)';
          tbodyThColorContainer.style.width = '13px';
          tbodyThColorContainer.style.height = '13px';
          tbodyThColorContainer.style['border-color'] = lineColor;
          tbodyThColorContainer.style['border-width'] = '1px';
          tbodyThColorContainer.style['border-style'] = 'solid';
          tbodyThColorContainer.style.padding = '0 0 0 0';
          const tCMargin = `${(rowHeight - 15) / 2}px`;
          tbodyThColorContainer.style.margin = `0 ${tCMargin} ${tCMargin}`;

          tbodyThColorDrop.style.width = '11px';
          tbodyThColorDrop.style.height = '11px';
          tbodyThColorDrop.style.position = 'relative';
          tbodyThColorDrop.style['border-width'] = '1px';
          tbodyThColorDrop.style['border-style'] = 'solid';
          tbodyThColorDrop.style['border-color'] = 'rgb(255,255,255)';
          tbodyThColorDrop.style['background-color'] = lineColor;

          const tbodyThValue = document.createElement('th');
          const tbodyThValueInside = document.createElement('div');
          // tbodyThValue.style.height = rowHeight + "px";
          tbodyThValueInside.style.height = `${rowHeight}px`;
          tbodyThValueInside.style.position = 'relative';
          tbodyThValueInside.style.top = '-2px';
          tbodyThValue.style.padding = '0 0 0 0';
          tbodyThValue.style.margin = '0 0 0 0';
          tbodyThValue.style.border = '0 0 0 0';
          tbodyThValueInside.style.padding = '0 0 0 0';
          tbodyThValueInside.style.margin = '0 0 0 0';
          tbodyThValueInside.style.border = '0 0 0 0';
          tbodyThValueInside.style['text-align'] = 'left';
          tbodyThValueInside.innerHTML = `${dataRow.name} : ${
            dataRow.data.toString().substring(0, 10)
          }`;
          tbodyThValue.appendChild(tbodyThValueInside);
          const tbodyTr = document.createElement('tr');
          tbodyThColorContainer.appendChild(tbodyThColorDrop);
          tbodyThColor.appendChild(tbodyThColorContainer);
          tbodyTr.appendChild(tbodyThColor);
          tbodyTr.appendChild(tbodyThValue);
          tbody.appendChild(tbodyTr);
        });

        const tipBox = document.createElement('div');
        tipBox.classList.add('ct-tip-box');

        const tipTitle = document.createElement('div');
        tipTitle.innerHTML = title;
        tipTitle.classList.add('ct-tip-title');
        tipTitle.style.width = '30px';
        tipTitle.style.height = '20px';
        tipTitle.style.border = '0 0 0 0';
        tipTitle.style.padding = '0 0 0 0';
        tipTitle.style.margin = '2px 0 0 -2px';
        tipTitle.style.color = 'rgb(255, 255, 255)';

        const table = document.createElement('table');
        table.classList.add('ct-tip-data-table');
        table.append(tbody);
        tipBox.append(tipTitle);
        const tipStats = document.createElement('div');
        tipStats.classList.add('ct-tip-stats');
        tipStats.append(table);
        tipBox.append(tipStats);
        tip.append(tipBox);
        const arrow = document.createElement('div');
        arrow.classList.add('ct-tip-arrow');
        tip.append(arrow);

        // Define X position
        let xPos = leftOffset(pointData.elements[0]);
        let isLeft = true;
        if (xPos > (leftOffset(chartElement) + rightOffset(chartElement)) / 2) {
          xPos = getWidth(chartElement)
            - rightOffset(pointData.elements[0]) + leftOffset(chartElement);
          isLeft = false;
        } else xPos -= leftOffset(chartElement);

        // Define Y position - TODO : handle undefined?
        const yPos = pointData.elements
          .map(topOffset).reduce((p, c) => c + p) / pointData.elements.length
          - topOffset(chartElement);

        if (options.chartType === 'bar') {
          const width = parseFloat(pointData.elements[0].css('stroke-width').replace('px', ''));
          xPos = xPos + (width / 2) + 5;
        }

        const arrowBorderSize = 7;

        tipBox.style.position = 'absolute';

        if (isLeft) tipBox.style.left = `${arrowBorderSize}px`;
        else tipBox.style.right = `${arrowBorderSize}px`;
        tipBox.style.width = tipBoxWidth;

        arrow.style.width = '0';
        arrow.style.height = '0';
        arrow.style.float = isLeft ? 'left' : 'right';
        arrow.style['border-top'] = `${arrowBorderSize * 0.8}px solid transparent`;
        arrow.style['border-bottom'] = `${arrowBorderSize * 0.8}px solid transparent`;
        if (isLeft) arrow.style['border-right'] = `${arrowBorderSize}px solid ${tipColor}`;
        else arrow.style['border-left'] = `${arrowBorderSize}px solid ${tipColor}`;
        arrow.style['background-color'] = 'rgba(0, 0, 0, 0)';
        arrow.style.position = 'absolute';
        if (isLeft) arrow.style.left = 0;
        else arrow.style.right = 0;
        arrow.style.top = `${tipBoxHeight / 2 - arrowBorderSize * 0.8}px`;

        // tip position
        if (isLeft) tip.style.left = `${xPos}px`;
        else tip.style.right = `${xPos}px`;
        tip.style.top = `${yPos}px`;
        tip.style['margin-top'] = `${-tipBoxHeight / 2}px`;
        tip.style.position = 'absolute';
        tip.style['pointer-events'] = 'none';

        // tipBox position
        tipBox.style.color = 'rgba(255, 255, 255, 0.8)';
        tipBox.style['background-color'] = tipColor;
        tipBox.style['border-radius'] = '5px';
        tipBox.style.width = `${tipBoxWidth}px`;
        tipBox.style.height = `${tipBoxHeight}px`;

        return tip;
      };

      const fillPositions = (maxRight, difference) => {
        positions = [];
        const dataLabels = chartData.labels;
        const dataSeries = chartData.series;

        let lastObject = null;
        farRight = 0;

        const elementClass = options.chartType === 'line' ? 'ct-point' : 'ct-bar';

        chartElement.querySelectorAll('.ct-series').forEach((serie, serieIndex) => {
          serie.querySelectorAll(`.${elementClass}`).forEach((currentElem, index) => {
            // definitions for all elemets including the first one
            let fromX = 0;
            let toX = maxRight;
            let center = 0;
            // definitions for all elements except the first one
            if (index !== 0) {
              center = ((leftOffset(currentElem) - difference)
                - (leftOffset(positions[lastObject].elements[0]) - difference)) / 2;
              positions[lastObject].toX = (
                (leftOffset(positions[lastObject].elements[0]) - difference) + center);
              fromX = positions[lastObject].toX;
              // last point should not go to the end to prevent
              // breaking mouse actions near the end of the chart
              if (index === length && (leftOffset(currentElem) - difference) > toX) toX -= center;
            }
            const reworkedData = Object.assign({}, dataSeries[serieIndex]);
            reworkedData.data = reworkedData.data[index];
            if (!positions[index]) {
              positions[index] = {
                type: options.chartType,
                fromX,
                toX,
                elements: [currentElem],
                data: {
                  label: dataLabels[index], series: [reworkedData],
                },
              };
            } else {
              positions[index].elements.push(currentElem);
              positions[index].data.series.push(reworkedData);
            }
            lastObject = index;
            farRight = toX;
          });
        });
        return [positions, farRight];
      };

      const handleData = (data) => {
        chartData = data.data;
        // be aware of the different positions of the chart line,
        // its grid and the actual mouse position which is the position
        // inside of the element, on which the event is called
        if (data.type === 'update') { // if type is initial, we still saved chartData for create
          const difference = leftOffset(
            chartElement.querySelector(`.ct-chart-${options.chartType}`),
          );
          const maxRight = parseFloat(
            getComputedStyle(chartElement, null).width.replace('px', ''),
          );
          fillPositions(maxRight, difference);
        }
      };

      /**
       * Created event
       *
       * @param  {object} data
       * @return {null}
       */
      chart.on('created', () => { // data => {
        // handleData(data); // TODO : make it work with incomplete data
        // be aware of the different positions of the chart line,
        // its grid and the actual mouse position which is the position
        // inside of the element, on which the event is called
        const difference = leftOffset(chartElement.querySelector(`.ct-chart-${options.chartType}`));
        const maxRight = getWidth(chartElement);
        fillPositions(maxRight, difference);
        const line = chartElement.getElementsByClassName(`ct-chart-${options.chartType}`)[0];
        if (!line) return;
        line.addEventListener('mousemove', function (event) { // eslint-disable-line
          const x = event.pageX - leftOffset(this);

          if (x < farLeft || x > farRight) {
            if (!document.getElementsByClassName('ct-tip').length) return false;
            document.getElementsByClassName('ct-tip')[0].remove();
            return true;
          }
          for (let key = 0; key < positions.length; key += 1) {
            // eslint-disable-next-line no-continue
            if (positions[key].fromX > x || positions[key].toX < x) continue;
            if (document.getElementsByClassName('ct-tip').length) {
              document.getElementsByClassName('ct-tip')[0].remove();
            }
            const tip = buildTooltip(positions[key]);
            chartElement.append(tip);
            tip.style.display = ''; // Show
          }
        });
        line.addEventListener('mouseleave', () => {
          setTimeout(() => { // eslint-disable-line consistent-return
            if (document.querySelectorAll('.ct-tip:hover').length) return true;
            if (!document.getElementsByClassName('ct-tip').length) return false;
            document.getElementsByClassName('ct-tip')[0].remove();
          }, 10);
        });
      });
      chart.on('data', handleData);
    };
  };
}
