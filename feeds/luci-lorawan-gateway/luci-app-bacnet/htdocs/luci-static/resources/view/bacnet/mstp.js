'use strict';
'require view';
'require form';
'require uci';

return view.extend({
	load: function() {
		return uci.load('bacnet');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('bacnet', _('MS/TP Settings'),
			_('Configure BACnet MS/TP serial port and data-link parameters.'));

		s = m.section(form.NamedSection, 'mstp', 'mstp');
		s.addremove = false;

		o = s.option(form.ListValue, 'device', _('Serial Device'),
			_('RS485 port connected to the BACnet MS/TP bus.'));
		o.value('RS485-1', 'RS485-1');
		o.value('RS485-2', 'RS485-2');
		o.value('RS485-3', 'RS485-3');
		o.default = 'RS485-1';

		o = s.option(form.ListValue, 'baudrate', _('Baud Rate'),
			_('BACnet MS/TP standard baud rates. 38400 and 9600 are most common.'));
		o.value('9600', '9600');
		o.value('19200', '19200');
		o.value('38400', '38400');
		o.value('57600', '57600');
		o.value('76800', '76800');
		o.value('115200', '115200');
		o.default = '38400';

		o = s.option(form.Value, 'mac_address', _('MAC Address'),
			_('MS/TP MAC address for this device (0–127). Must be unique on the bus.'));
		o.datatype = 'range(0,127)';
		o.placeholder = '1';
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'max_master', _('Max Master'),
			_('Highest MS/TP MAC address of any master on the network (0–127).'));
		o.datatype = 'range(0,127)';
		o.placeholder = '127';
		o.default = '127';
		o.rmempty = false;

		o = s.option(form.Value, 'max_info_frames', _('Max Info Frames'),
			_('Maximum information frames this device may send per token pass (1–255).'));
		o.datatype = 'range(1,255)';
		o.placeholder = '1';
		o.default = '1';
		o.rmempty = false;

		return m.render();
	}
});
