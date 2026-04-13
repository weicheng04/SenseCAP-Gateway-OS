'use strict';
'require view';
'require form';
'require uci';
'require ui';

return view.extend({
    load: function() {
        return uci.load('bacnet');
    },

    render: function() {
        var m, s, o;

        m = new form.Map('bacnet', _('MQTT Data Routing'),
            _('Configure MQTT integration for the BACnet Gateway. The gateway supports dual services: BACnet/IP Gateway and MQTT.'));

        s = m.section(form.NamedSection, 'mqtt', 'mqtt');
        s.addremove = false;

        /* ---- Connection Section ---- */
        o = s.option(form.DummyValue, '_connection_header');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<h3 style="margin-top:0;padding-top:10px;">Connection</h3>';
        };

        o = s.option(form.Button, '_toggle_mqtt', _('MQTT Data Routing Status'));
        o.inputtitle = function() {
            var enabled = uci.get('bacnet', 'mqtt', 'enabled');
            return enabled === '1' ? _('Disable MQTT Data Routing') : _('Enable MQTT Data Routing');
        };
        o.inputstyle = function() {
            var enabled = uci.get('bacnet', 'mqtt', 'enabled');
            return enabled === '1' ? 'reset' : 'apply';
        };
        o.onclick = function(ev) {
            var currentEnabled = uci.get('bacnet', 'mqtt', 'enabled');
            if (currentEnabled === '1') {
                uci.set('bacnet', 'mqtt', 'enabled', '0');
                ev.target.textContent = _('Enable MQTT Data Routing');
                ev.target.className = 'cbi-button cbi-button-apply';
            } else {
                var gatewayEnabled = uci.get('bacnet', 'gateway', 'enabled');
                if (gatewayEnabled !== '1') {
                    ui.showModal(_('Cannot Enable MQTT Data Routing'), [
                        E('p', _('Please enable BACnet Gateway first before enabling MQTT Data Routing.')),
                        E('div', { 'style': 'display: flex; justify-content: space-between; margin-top: 10px;' }, [
                            E('button', {
                                'class': 'cbi-button cbi-button-primary',
                                'click': function() {
                                    ui.hideModal();
                                    window.location.href = '/cgi-bin/luci/admin/bacnet/general';
                                }
                            }, _('Go to Configuration')),
                            E('button', {
                                'class': 'cbi-button',
                                'click': ui.hideModal
                            }, _('Cancel'))
                        ])
                    ]);
                    return;
                }
                uci.set('bacnet', 'mqtt', 'enabled', '1');
                ev.target.textContent = _('Disable MQTT Data Routing');
                ev.target.className = 'cbi-button cbi-button-reset';
            }
        };
        o.description = _('When enabled, the BACnet Gateway will forward device data via MQTT.');

        o = s.option(form.Value, 'host', _('MQTT Broker Address'),
            _('The hostname or IP address of the MQTT server to connect to.'));
        o.datatype = 'or(hostname,ipaddr)';
        o.placeholder = 'mqtt.example.com';
        o.rmempty = false;

        o = s.option(form.Value, 'port', _('MQTT Broker Port'),
            _('The port number for the MQTT server (default: 1883 for unencrypted, 8883 for TLS).'));
        o.datatype = 'port';
        o.placeholder = '1883';
        o.default = '1883';

        o = s.option(form.ListValue, 'mqtt_version', _('MQTT Version'),
            _('Select the MQTT protocol version that matches your server.'));
        o.value('3.1', 'v3.1');
        o.value('3.1.1', 'v3.1.1');
        o.value('5', 'v5.0');
        o.default = '3.1.1';

        o = s.option(form.ListValue, 'qos', _('QoS'),
            _('Level of message delivery assurance.'));
        o.value('0', '0 - At Most Once');
        o.value('1', '1 - At Least Once');
        o.value('2', '2 - Exactly Once');
        o.default = '1';

        o = s.option(form.Value, 'keepalive', _('Keepalive Interval (s)'),
            _('Interval in seconds between keep-alive pings.'));
        o.datatype = 'range(5,120)';
        o.placeholder = '10';
        o.default = '10';

        o = s.option(form.Flag, 'clean_session', _('Clean Session'));
        o.default = '1';

        o = s.option(form.Flag, 'retain', _('Retain'));
        o.default = '0';

        /* ---- Authentication Section ---- */
        o = s.option(form.DummyValue, '_auth_header');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<h3 style="margin-top:20px;padding-top:10px;">Authentication</h3>';
        };

        o = s.option(form.Value, 'client_id', _('Client ID'));
        o.placeholder = 'bacnet-gateway';
        o.optional = true;

        o = s.option(form.Flag, 'enable_auth', _('Enable User Authentication'));
        o.default = '0';

        o = s.option(form.Value, 'username', _('Username'));
        o.depends('enable_auth', '1');
        o.optional = true;

        o = s.option(form.Value, 'password', _('Password'));
        o.depends('enable_auth', '1');
        o.password = true;
        o.optional = true;

        o = s.option(form.ListValue, 'ssl_mode', _('SSL/TLS Mode'));
        o.value('none', _('None'));
        o.value('tls-server', _('TLS Server Verification'));
        o.value('mutual-tls', _('Mutual TLS'));
        o.default = 'none';

        o = s.option(form.FileUpload, 'ca_cert', _('CA Certificate'));
        o.depends('ssl_mode', 'tls-server');
        o.depends('ssl_mode', 'mutual-tls');
        o.optional = true;

        o = s.option(form.FileUpload, 'client_cert', _('Client Certificate'));
        o.depends('ssl_mode', 'mutual-tls');
        o.optional = true;

        o = s.option(form.FileUpload, 'client_key', _('Client Private Key'));
        o.depends('ssl_mode', 'mutual-tls');
        o.optional = true;

        /* ---- Topic Configuration Section ---- */
        o = s.option(form.DummyValue, '_topic_header');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<h3 style="margin-top:20px;padding-top:10px;">Topic Configuration</h3>';
        };

        o = s.option(form.Value, 'uplink_topic', _('Uplink Topic'),
            _('MQTT topic for receiving uplink data from LoRaWAN devices. Use {{device_EUI}} as a placeholder.'));
        o.placeholder = 'application/BACNet/device/{{device_EUI}}/rx';
        o.default = 'application/BACNet/device/{{device_EUI}}/rx';
        o.rmempty = false;

        o = s.option(form.Value, 'downlink_topic', _('Downlink Topic'),
            _('MQTT topic for sending downlink commands. Use {{device_EUI}} as a placeholder.'));
        o.placeholder = 'application/BACNet/device/{{device_EUI}}/tx';
        o.default = 'application/BACNet/device/{{device_EUI}}/tx';
        o.rmempty = false;

        o = s.option(form.Value, 'downlink_ack_topic', _('Downlink Acknowledge Topic'),
            _('MQTT topic for downlink acknowledgments. Use {{device_EUI}} as a placeholder.'));
        o.placeholder = 'application/BACNet/device/{{device_EUI}}/ack';
        o.default = 'application/BACNet/device/{{device_EUI}}/ack';
        o.optional = true;

        return m.render();
    }
});
