'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require fs';
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

		var m, s, o;

		m = new form.Map('bacnet', _('BACnet Service'),
			_('Configure BACnet MS/TP device server (bacserv).'));

		s = m.section(form.NamedSection, 'general', 'service');
		s.addremove = false;

		// Service status display
		o = s.option(form.DummyValue, '_status', _('Service Status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			if (isRunning)
				return '<span style="color:#4caf50;font-weight:bold;">' + _('Running') + '</span>';
			else
				return '<span style="color:#999;">' + _('Stopped') + '</span>';
		};

		// Enable/Disable toggle
		o = s.option(form.Button, '_toggle_service', _('Service Control'));
		o.inputtitle = function() {
			var enabled = uci.get('bacnet', 'general', 'enabled');
			return enabled === '1' ? _('Disable Service') : _('Enable Service');
		};
		o.inputstyle = function() {
			var enabled = uci.get('bacnet', 'general', 'enabled');
			return enabled === '1' ? 'reset' : 'apply';
		};
		o.onclick = function(ev) {
			var currentEnabled = uci.get('bacnet', 'general', 'enabled');
			if (currentEnabled === '1') {
				uci.set('bacnet', 'general', 'enabled', '0');
				ev.target.textContent = _('Enable Service');
				ev.target.className = 'cbi-button cbi-button-apply';
			} else {
				uci.set('bacnet', 'general', 'enabled', '1');
				ev.target.textContent = _('Disable Service');
				ev.target.className = 'cbi-button cbi-button-reset';
			}
		};

		// Restart button
		o = s.option(form.Button, '_restart', _('Restart Service'));
		o.inputtitle = _('Restart');
		o.inputstyle = 'action important';
		o.onclick = function(ev) {
			return fs.exec('/etc/init.d/bacnet', ['restart']).then(function() {
				ui.addNotification(null, E('p', _('BACnet service restarted.')), 'info');
			}).catch(function(e) {
				ui.addNotification(null, E('p', _('Failed to restart service: ') + e.message), 'error');
			});
		};

		// Device identity section
		s = m.section(form.NamedSection, 'device', 'device', _('Device Identity'));
		s.addremove = false;

		o = s.option(form.Value, 'device_instance', _('Device Instance ID'),
			_('Unique BACnet device instance number on the network (0–4194302).'));
		o.datatype = 'range(0,4194302)';
		o.placeholder = '1234';
		o.default = '1234';
		o.rmempty = false;

		o = s.option(form.Value, 'device_name', _('Device Name'),
			_('Human-readable name for this BACnet device.'));
		o.placeholder = 'SenseCAP Gateway';
		o.default = 'SenseCAP Gateway';

		o = s.option(form.Value, 'vendor_name', _('Vendor Name'));
		o.placeholder = 'Seeed';
		o.default = 'Seeed';

		o = s.option(form.Value, 'model_name', _('Model Name'));
		o.placeholder = 'reComputer R1225';
		o.default = 'reComputer R1225';

		return m.render();
	}
});
