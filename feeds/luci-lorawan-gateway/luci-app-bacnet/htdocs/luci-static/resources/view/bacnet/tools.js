'use strict';
'require view';
'require ui';
'require fs';
'require uci';
'require rpc';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('bacnet'),
			callServiceList('bacnet')
		]);
	},

	render: function(data) {
		var serviceData = data[1];
		var isRunning = !!(serviceData && serviceData.bacnet &&
			serviceData.bacnet.instances && Object.keys(serviceData.bacnet.instances).length > 0);

		var view = E('div', { 'class': 'cbi-map' }, [
			E('h2', _('BACnet Tools')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Diagnostic tools for the BACnet MS/TP network. ') +
				(isRunning
					? _('<strong>Note:</strong> The BACnet server (bacserv) is currently running. ' +
					    'Some tools (WhoIs, ReadProperty) require exclusive serial port access. ' +
					    'Stop the service first if tools fail.')
					: _('The BACnet server is stopped. Tools can access the serial port freely.')))
		]);

		// --- Who-Is Section ---
		var whoisResult = E('textarea', {
			'id': 'whois-result',
			'style': 'width:100%;height:200px;font-family:monospace;font-size:13px;',
			'readonly': 'readonly',
			'placeholder': _('WhoIs results will appear here...')
		});

		view.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Who-Is (Device Discovery)')),
			E('div', { 'class': 'cbi-section-descr' },
				_('Broadcast a BACnet Who-Is request to discover devices on the MS/TP bus.')),
			E('div', { 'class': 'cbi-value' }, [
				E('div', { 'style': 'margin-bottom: 10px;' }, [
					E('button', {
						'class': 'cbi-button cbi-button-apply',
						'click': function(ev) {
							var btn = ev.target;
							btn.disabled = true;
							btn.textContent = _('Discovering...');
							whoisResult.value = '';

							fs.exec('/usr/bin/bacnet-env', ['bacwhois'], { timeout: 10 })
								.then(function(res) {
									var output = (res.stdout || '').trim();
									var err = (res.stderr || '').trim();
									if (output)
										whoisResult.value = output;
									else if (err)
										whoisResult.value = _('Error: ') + err;
									else
										whoisResult.value = _('No devices found.');
								})
								.catch(function(e) {
									whoisResult.value = _('Execution failed: ') + e.message;
								})
								.finally(function() {
									btn.disabled = false;
									btn.textContent = _('Discover Devices');
								});
						}
					}, _('Discover Devices'))
				]),
				whoisResult
			])
		]));

		// --- Read Property Section ---
		var rpDeviceInstance = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': '1234', 'style': 'width:120px;'
		});
		var rpObjectType = E('select', { 'class': 'cbi-input-select', 'style': 'width:180px;' }, [
			E('option', { 'value': '8' }, 'Device (8)'),
			E('option', { 'value': '0' }, 'Analog Input (0)'),
			E('option', { 'value': '1' }, 'Analog Output (1)'),
			E('option', { 'value': '2' }, 'Analog Value (2)'),
			E('option', { 'value': '3' }, 'Binary Input (3)'),
			E('option', { 'value': '4' }, 'Binary Output (4)'),
			E('option', { 'value': '5' }, 'Binary Value (5)'),
			E('option', { 'value': '13' }, 'Multi-state Input (13)'),
			E('option', { 'value': '14' }, 'Multi-state Output (14)')
		]);
		var rpObjectInstance = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': '0', 'style': 'width:120px;'
		});
		var rpPropertyId = E('select', { 'class': 'cbi-input-select', 'style': 'width:200px;' }, [
			E('option', { 'value': '85' }, 'Present Value (85)'),
			E('option', { 'value': '77' }, 'Object Name (77)'),
			E('option', { 'value': '79' }, 'Object Type (79)'),
			E('option', { 'value': '28' }, 'Description (28)'),
			E('option', { 'value': '36' }, 'Event State (36)'),
			E('option', { 'value': '103' }, 'Reliability (103)'),
			E('option', { 'value': '111' }, 'Status Flags (111)'),
			E('option', { 'value': '75' }, 'Object Identifier (75)'),
			E('option', { 'value': '76' }, 'Object List (76)')
		]);
		var rpResult = E('textarea', {
			'id': 'rp-result',
			'style': 'width:100%;height:120px;font-family:monospace;font-size:13px;',
			'readonly': 'readonly',
			'placeholder': _('ReadProperty result will appear here...')
		});

		view.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Read Property')),
			E('div', { 'class': 'cbi-section-descr' },
				_('Read a property from a remote BACnet device.')),
			E('table', { 'class': 'cbi-section-table', 'style': 'border:none;' }, [
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Device Instance:')),
					E('td', { 'style': 'padding:4px;' }, rpDeviceInstance)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Object Type:')),
					E('td', { 'style': 'padding:4px;' }, rpObjectType)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Object Instance:')),
					E('td', { 'style': 'padding:4px;' }, rpObjectInstance)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Property:')),
					E('td', { 'style': 'padding:4px;' }, rpPropertyId)
				])
			]),
			E('div', { 'style': 'margin: 10px 0;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function(ev) {
						var devInst = rpDeviceInstance.value.trim();
						var objType = rpObjectType.value;
						var objInst = rpObjectInstance.value.trim();
						var propId = rpPropertyId.value;

						if (!devInst || !objInst) {
							rpResult.value = _('Please fill in Device Instance and Object Instance.');
							return;
						}
						if (!/^\d+$/.test(devInst) || !/^\d+$/.test(objInst)) {
							rpResult.value = _('Device Instance and Object Instance must be numeric.');
							return;
						}

						var btn = ev.target;
						btn.disabled = true;
						btn.textContent = _('Reading...');
						rpResult.value = '';

						fs.exec('/usr/bin/bacnet-env', [
							'bacrp', devInst, objType, objInst, propId
						], { timeout: 10 })
							.then(function(res) {
								var output = (res.stdout || '').trim();
								var err = (res.stderr || '').trim();
								if (output)
									rpResult.value = output;
								else if (err)
									rpResult.value = _('Error: ') + err;
								else
									rpResult.value = _('No response.');
							})
							.catch(function(e) {
								rpResult.value = _('Execution failed: ') + e.message;
							})
							.finally(function() {
								btn.disabled = false;
								btn.textContent = _('Read');
							});
					}
				}, _('Read'))
			]),
			rpResult
		]));

		// --- Write Property Section ---
		var wpDeviceInstance = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': '1234', 'style': 'width:120px;'
		});
		var wpObjectType = E('select', { 'class': 'cbi-input-select', 'style': 'width:180px;' }, [
			E('option', { 'value': '1' }, 'Analog Output (1)'),
			E('option', { 'value': '2' }, 'Analog Value (2)'),
			E('option', { 'value': '4' }, 'Binary Output (4)'),
			E('option', { 'value': '5' }, 'Binary Value (5)'),
			E('option', { 'value': '14' }, 'Multi-state Output (14)')
		]);
		var wpObjectInstance = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': '0', 'style': 'width:120px;'
		});
		var wpPriority = E('select', { 'class': 'cbi-input-select', 'style': 'width:120px;' }, [
			E('option', { 'value': '0' }, _('None (0)')),
			E('option', { 'value': '8' }, _('Manual Op. (8)')),
			E('option', { 'value': '16' }, _('Lowest (16)'))
		]);
		var wpTag = E('select', { 'class': 'cbi-input-select', 'style': 'width:180px;' }, [
			E('option', { 'value': '4' }, 'REAL (4)'),
			E('option', { 'value': '9' }, 'ENUMERATED (9)'),
			E('option', { 'value': '2' }, 'UNSIGNED INT (2)'),
			E('option', { 'value': '1' }, 'BOOLEAN (1)')
		]);
		var wpValue = E('input', {
			'type': 'text', 'class': 'cbi-input-text',
			'placeholder': '0', 'style': 'width:120px;'
		});
		var wpResult = E('textarea', {
			'id': 'wp-result',
			'style': 'width:100%;height:80px;font-family:monospace;font-size:13px;',
			'readonly': 'readonly',
			'placeholder': _('WriteProperty result will appear here...')
		});

		view.appendChild(E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Write Property')),
			E('div', { 'class': 'cbi-section-descr' },
				_('Write Present Value (85) to a remote BACnet device.')),
			E('table', { 'class': 'cbi-section-table', 'style': 'border:none;' }, [
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Device Instance:')),
					E('td', { 'style': 'padding:4px;' }, wpDeviceInstance)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Object Type:')),
					E('td', { 'style': 'padding:4px;' }, wpObjectType)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Object Instance:')),
					E('td', { 'style': 'padding:4px;' }, wpObjectInstance)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Priority:')),
					E('td', { 'style': 'padding:4px;' }, wpPriority)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Data Type:')),
					E('td', { 'style': 'padding:4px;' }, wpTag)
				]),
				E('tr', [
					E('td', { 'style': 'padding:4px;' }, _('Value:')),
					E('td', { 'style': 'padding:4px;' }, wpValue)
				])
			]),
			E('div', { 'style': 'margin: 10px 0;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function(ev) {
						var devInst = wpDeviceInstance.value.trim();
						var objType = wpObjectType.value;
						var objInst = wpObjectInstance.value.trim();
						var priority = wpPriority.value;
						var tag = wpTag.value;
						var val = wpValue.value.trim();

						if (!devInst || !objInst || val === '') {
							wpResult.value = _('Please fill in all required fields.');
							return;
						}
						if (!/^\d+$/.test(devInst) || !/^\d+$/.test(objInst)) {
							wpResult.value = _('Device Instance and Object Instance must be numeric.');
							return;
						}

						var btn = ev.target;
						btn.disabled = true;
						btn.textContent = _('Writing...');
						wpResult.value = '';

						fs.exec('/usr/bin/bacnet-env', [
							'bacwp', devInst, objType, objInst, '85',
							priority, tag, val
						], { timeout: 10 })
							.then(function(res) {
								var output = (res.stdout || '').trim();
								var err = (res.stderr || '').trim();
								if (output)
									wpResult.value = output;
								else if (err)
									wpResult.value = _('Error: ') + err;
								else
									wpResult.value = _('Write successful (no output).');
							})
							.catch(function(e) {
								wpResult.value = _('Execution failed: ') + e.message;
							})
							.finally(function() {
								btn.disabled = false;
								btn.textContent = _('Write');
							});
					}
				}, _('Write'))
			]),
			wpResult
		]));

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
