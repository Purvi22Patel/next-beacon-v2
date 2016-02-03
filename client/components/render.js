'use strict';

import KeenQuery from 'n-keen-query';
import querystring from 'querystring';
import Delegate from 'dom-delegate';

const kqObjects = {};


function getChartContainer (el) {
	while (!el.classList.contains('chart-container')) {
		el = el.parentNode;
	}
	return el;
}

// Shake the alias and builtQuery up then bake it into the Dom element
const shakeAndBake = (alias, builtQuery, el) => {
	try {
		alias.explorerURL = '/data/explorer?' + KeenQuery.generateExplorerUrl(builtQuery);
		alias.printer = alias.printer || 'LineChart';

		// Fetch the data from Keen API and call the printer function
		builtQuery.print(alias.printer)

			// Handle the response from the printer function
			.then(res => {
				el.classList.remove('chart-loading');
				el.classList.add('chart-loaded');
				if (typeof res === 'function') {
					res(el, alias);
				} else {
					el.classList.add('chart-error');
					throw 'There is a problem with the keen-query response.'
				}
			});
	} catch (err) {
		console.log('err', alias);
		el.classList.remove('chart-loading');
		el.classList.add('chart-error');
		el.innerHTML = `<p class="error"><strong>Error: </strong>${err.message || err}</span><p>${alias.name}, ${alias.label}, ${alias.question}: ${alias.query}</p>`;
	}
}

function composeKqModifiers(funcs) {
	const composed = kq => {
		let func;
		while (func = funcs.shift()) {
			kq = func(kq);
		}
		return kq;
	}
	return composed;
}
function adjustTimeframe (timeframe) {

	if (typeof timeframe === 'string') {
		if (timeframe.charAt(0) === '{') {
			timeframe = JSON.parse(timeframe)
		} else {
			return kq => kq.relTime(timeframe);
		}
	}
	if (timeframe && timeframe.start && timeframe.end) {
		return kq => kq.absTime(timeframe.start, timeframe.end);
	}
	return kq => kq;
}

function adjustInterval(interval) {
	if (interval) {
		return kq => kq.interval(interval);
	} else {
		return kq => kq;
	}
}

function getKqCustomiser (opts) {
	return composeKqModifiers([
		adjustTimeframe(opts.timeframe),
		adjustInterval(opts.interval)
	]);
}

function getQuery () {
	const q = querystring.parse(location.search.substr(1));
	if (!q.timeframe && q['timeframe[start]'] && q['timeframe[end]']) {
		q.timeframe = {
			start: q['timeframe[start]'],
			end: q['timeframe[end]']
		};
	}
	return q;
}

function reprint (container, opts) {
	const aliasName = container.dataset.keenAlias;
	const kq = kqObjects[aliasName];
	const printerEl = container.querySelector('.chart__printer')
	printerEl.classList.add('chart-loading');
	shakeAndBake(window.aliases[aliasName], getKqCustomiser(opts)(kq), printerEl);
}

function getTimeframe(container, type) {
	const relTimeEl = container.querySelector('[name="timeframe"]:checked')
	const relTime = relTimeEl && relTimeEl.value;
	const startEl = container.querySelector('.timeframe-switcher__start');
	const endEl = container.querySelector('.timeframe-switcher__end');
	const absTime = {
		start: startEl.value,
		end: endEl.value
	};

	// fully set absolute time
	if (absTime.start && absTime.end && type !== 'rel') {
		relTimeEl && relTimeEl.removeAttribute('checked');
		return absTime;
	// midway through setting absolute time
	} else if (type === 'abs') {
		return null;
	// otherwise fallback to relative time range
	} else {
		endEl.value = '';
		startEl.value = '';
		if (!relTime) {
			container.querySelector('.timeframe-switcher__timeframe[value="this_14_days"]').setAttribute('checked', '');
			return 'this_14_days';
		}
		return relTime;
	}

}

module.exports = {
	init: () => {
		const del = new Delegate(document.querySelector('.charts'));
		const q = getQuery();

		let customiser = getKqCustomiser(q);

		del.on('change', '.timeframe-switcher__interval', function (ev) {
			ev.preventDefault();
			const container = getChartContainer(ev.target);
			reprint(container, {
				timeframe: getTimeframe(container),
				interval: container.querySelector('.timeframe-switcher__interval').value
			});
		});

		del.on('change', '.timeframe-switcher__start, .timeframe-switcher__end, .timeframe-switcher [name="timeframe"]', function (ev) {
			ev.preventDefault();
			const type = ev.target.name === 'timeframe' ? 'rel' : 'abs';
			const container = getChartContainer(ev.target);
			const timeframe = getTimeframe(container, type);
			if (!timeframe) {
				return;
			}
			reprint(container, {
				timeframe: getTimeframe(container, type),
				interval: container.querySelector('.timeframe-switcher__interval').value
			});
		});

		[].slice.call(document.querySelectorAll('.chart-container')).forEach(el => {
			const aliasAttribute = el.getAttribute('data-keen-alias');

			if (window.aliases && window.aliases[aliasAttribute]) {
				const alias = window.aliases[aliasAttribute];
				const builtQuery = customiser(KeenQuery.buildFromAlias(alias));
				kqObjects[aliasAttribute] = builtQuery;
				const printerEl = el.querySelector('.chart__printer')
				shakeAndBake(alias, builtQuery, printerEl);

				// HACK DURING DEVELOPMENT: Multiple prints of a single KeenQuery
				if (/^\/multi-print\//.test(location.pathname)) {

					// 02
					const builtQuery02 = builtQuery
						.relTime('this_90_days');

					let el02 = el.parentElement.cloneNode(true);
					el.parentElement.parentElement.appendChild(el02);

					shakeAndBake(alias, builtQuery02, el02);

					// 03
					const builtQuery03 = builtQuery
						.relTime('this_14_days')
						.interval('d');

					let el03 = el.parentElement.cloneNode(true);
					el.parentElement.parentElement.appendChild(el03);

					shakeAndBake(alias, builtQuery03, el03);

					// 04
					const builtQuery04 = builtQuery
						.relTime('this_7_days')
						.interval('d');

					let el04 = el.parentElement.cloneNode(true);
					el.parentElement.parentElement.appendChild(el04);

					let alias04 = Object.assign({}, alias);
					alias04.printer = 'LineChart';
					shakeAndBake(alias04, builtQuery04, el04);
				}
			}
		});
	}
}
