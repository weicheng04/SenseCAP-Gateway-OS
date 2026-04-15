'use strict';
'require view';
'require form';
'require uci';
'require ui';

/* ------------------------------------------------------------------
 * Build MQTT options for one port
 * ------------------------------------------------------------------ */
function buildPortMap(portNum) {
    var sid = 'port' + portNum;
    var portLabel = 'CH' + portNum;

    var m = new form.Map('rs485-module', '');

    var s = m.section(form.NamedSection, sid, 'port', _('MQTT Settings'));
    s.addremove = false;
    var o;

    o = s.option(form.ListValue, 'mqtt_transport', _('Transport'));
    o.value('tcp','TCP'); o.value('ssl','SSL/TLS'); o.value('ws','WebSocket'); o.value('wss','WebSocket Secure');
    o.default = 'tcp';

    o = s.option(form.Value, 'mqtt_host', _('Server Address'));
    o.datatype = 'or(hostname,ipaddr)'; o.placeholder = 'mqtt.example.com'; o.rmempty = false;

    o = s.option(form.Value, 'mqtt_port', _('Server Port'));
    o.datatype = 'port'; o.placeholder = '1883'; o.default = '1883';

    o = s.option(form.Value, 'mqtt_client_id', _('Client ID'));
    o.datatype = 'maxlength(32)'; o.placeholder = 'gateway-rs485-' + portNum;

    o = s.option(form.Value, 'mqtt_keepalive', _('Keep Alive (s)'));
    o.datatype = 'range(5,120)'; o.placeholder = '30'; o.default = '30';

    o = s.option(form.Value, 'mqtt_username', _('Username'));
    o.optional = true;

    o = s.option(form.Value, 'mqtt_password', _('Password'));
    o.password = true; o.optional = true;

    o = s.option(form.ListValue, 'mqtt_auth_mode', _('Authentication Mode'));
    o.value('none', _('Username/Password Only')); o.value('tls-server', _('TLS Server Verification'));
    o.value('mutual-tls', _('Mutual TLS')); o.value('token', _('Token Authentication'));
    o.default = 'none';

    o = s.option(form.FileUpload, 'mqtt_ca_cert', _('CA Certificate'));
    o.depends('mqtt_auth_mode', 'tls-server');
    o.depends('mqtt_auth_mode', 'mutual-tls'); o.optional = true;

    o = s.option(form.FileUpload, 'mqtt_client_cert', _('Client Certificate'));
    o.depends('mqtt_auth_mode', 'mutual-tls'); o.optional = true;

    o = s.option(form.FileUpload, 'mqtt_client_key', _('Client Private Key'));
    o.depends('mqtt_auth_mode', 'mutual-tls'); o.optional = true;

    o = s.option(form.Value, 'mqtt_token', _('Access Token'));
    o.depends('mqtt_auth_mode', 'token'); o.optional = true;

    o = s.option(form.Value, 'mqtt_uplink_topic', _('Uplink Topic'));
    o.placeholder = 'rs485/' + portLabel + '/uplink';
    o.default    = 'rs485/' + portLabel + '/uplink';

    o = s.option(form.Value, 'mqtt_downlink_topic', _('Downlink Topic'));
    o.placeholder = 'rs485/' + portLabel + '/downlink';
    o.default    = 'rs485/' + portLabel + '/downlink';

    o = s.option(form.ListValue, 'mqtt_qos', _('QoS Level'));
    o.value('0','0 - At most once'); o.value('1','1 - At least once'); o.value('2','2 - Exactly once');
    o.default = '0';

    o = s.option(form.Flag, 'mqtt_clean_session', _('Clean Session'));
    o.default = '1';

    o = s.option(form.Value, 'mqtt_reconnect_delay', _('Reconnect Delay (s)'));
    o.datatype = 'range(1,120)'; o.placeholder = '5'; o.default = '5';

    return m;
}

/* ------------------------------------------------------------------
 * Main view  —  3 independent Maps + custom tab UI
 * ------------------------------------------------------------------ */
return view.extend({
    _maps: null,

    load: function() {
        return uci.load('rs485-module').then(function() {
            var needSave = false;
            for (var i = 1; i <= 3; i++) {
                var sid = 'port' + i;
                if (!uci.get('rs485-module', sid)) {
                    uci.add('rs485-module', 'port', sid);
                    needSave = true;
                }
            }
            if (needSave)
                return uci.save().then(function() { return uci.load('rs485-module'); });
        });
    },

    render: function() {
        var self = this;
        self._maps = [buildPortMap(1), buildPortMap(2), buildPortMap(3)];

        return Promise.all(self._maps.map(function(m) { return m.render(); }))
        .then(function(mapEls) {
            mapEls.forEach(function(el, idx) {
                var h2 = el.querySelector('h2');
                if (h2) h2.style.display = 'none';
                el.style.display = idx === 0 ? '' : 'none';
            });

            var tabBar = E('ul', { 'class': 'cbi-tabmenu' });
            mapEls.forEach(function(_, idx) {
                var li = E('li', { 'class': idx === 0 ? 'cbi-tab' : 'cbi-tab-disabled' });
                li.appendChild(E('a', { 'href': 'javascript:void(0)' }, 'CH' + (idx + 1)));
                tabBar.appendChild(li);
            });

            var tabItems = tabBar.querySelectorAll('li');
            function switchTab(activeIdx) {
                tabItems.forEach(function(t) { t.className = 'cbi-tab-disabled'; });
                tabItems[activeIdx].className = 'cbi-tab';
                mapEls.forEach(function(p) { p.style.display = 'none'; });
                mapEls[activeIdx].style.display = '';
            }
            tabItems.forEach(function(item, idx) {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchTab(idx);
                });
            });

            var wrapper = E('div', { 'class': 'cbi-map', 'id': 'rs485-mqtt-tabs-wrapper' }, [
                E('h2', {}, _('MQTT Settings')),
                E('div', { 'class': 'cbi-map-descr' },
                    _('Configure MQTT bridge parameters for each RS485 port.')),
                tabBar
            ]);
            mapEls.forEach(function(el) { wrapper.appendChild(el); });
            return wrapper;
        });
    },

    handleSave: function(ev) {
        return Promise.all(this._maps.map(function(m) { return m.parse(); }))
            .then(function() { return uci.save(); });
    },

    handleSaveApply: function(ev, mode) {
        return this.handleSave(ev).then(function() {
            return ui.changes.apply(mode === '0');
        });
    },

    handleReset: null
});
