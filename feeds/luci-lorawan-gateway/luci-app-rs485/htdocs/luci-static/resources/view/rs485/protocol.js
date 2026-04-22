'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require fs';

/* ------------------------------------------------------------------
 * Build protocol options for one port — returns array of two Maps
 * [0] = Protocol Configuration (status + type)
 * [1] = Protocol detail (Modbus RTU or BACnet MS/TP)
 * ------------------------------------------------------------------ */
function buildPortMaps(portNum) {
    var sid = 'port' + portNum;
    var maps = [];

    function ensureExecSuccess(result, action) {
        if (!result || typeof result.code !== 'number' || result.code === 0)
            return result;

        var details = (result.stderr || result.stdout || '').trim();
        throw new Error(details ? (action + ': ' + details) : action);
    }

    function shellQuote(value) {
        return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }

    function getManualBacnetValue(field) {
        var input = document.getElementById('bacnet_' + field + '_' + portNum);
        return input ? input.value.trim() : '';
    }

    function setBacnetResult(resultArea, message, isError) {
        if (!resultArea)
            return;

        resultArea.value = message;
        resultArea.style.color = isError ? '#d00' : '';
    }

    function parseOptionalInteger(value, label) {
        if (value === '')
            return null;

        if (!/^\d+$/.test(value))
            throw new Error(label + ' ' + _('must be a non-negative integer.'));

        return parseInt(value, 10);
    }

    function buildBacnetRequestPayload() {
        var targetDevice = getManualBacnetValue('target_device');
        var objectType = getManualBacnetValue('object_type');
        var objectInstance = getManualBacnetValue('object_instance');
        var property = getManualBacnetValue('property');
        var arrayIndex = getManualBacnetValue('array_index');
        var hasPropertyRequest = objectType !== '' || objectInstance !== '' || property !== '' || arrayIndex !== '';

        if (hasPropertyRequest && (objectType === '' || objectInstance === '' || property === '')) {
            throw new Error(_('Targeted BACnet reads require Object Type, Object Instance, and Property.'));
        }

        var payload = {};
        var parsedTargetDevice = parseOptionalInteger(targetDevice, _('Target Device Instance'));
        var parsedObjectInstance = parseOptionalInteger(objectInstance, _('Object Instance'));
        var parsedArrayIndex = parseOptionalInteger(arrayIndex, _('Array Index'));

        if (parsedTargetDevice !== null)
            payload.target_device_instance = parsedTargetDevice;
        if (objectType !== '')
            payload.object_type = objectType;
        if (parsedObjectInstance !== null)
            payload.object_instance = parsedObjectInstance;
        if (property !== '')
            payload.property = property;
        if (parsedArrayIndex !== null)
            payload.array_index = parsedArrayIndex;

        return payload;
    }

    function writeBacnetRequestFile(requestPath, payload) {
        return fs.exec('/bin/sh', ['-c',
            'mkdir -p /tmp/rs485 && printf %s ' + shellQuote(JSON.stringify(payload)) +
            ' > ' + shellQuote(requestPath)
        ]).then(function(result) {
            return ensureExecSuccess(result, _('Failed to write BACnet request'));
        });
    }

    function bacnetManualReadRow(field, title, placeholder, description) {
        return E('div', { 'class': 'cbi-value' }, [
            E('label', {
                'class': 'cbi-value-title',
                'for': 'bacnet_' + field + '_' + portNum
            }, title),
            E('div', { 'class': 'cbi-value-field' }, [
                E('input', {
                    'id': 'bacnet_' + field + '_' + portNum,
                    'class': 'cbi-input-text',
                    'type': 'text',
                    'placeholder': placeholder
                }),
                E('div', { 'class': 'cbi-value-description' }, description)
            ])
        ]);
    }

    /* ===== Map 1: Protocol Configuration ===== */
    var m1 = new form.Map('rs485-module', '');
    var s1 = m1.section(form.NamedSection, sid, 'port', _('Protocol Configuration'));
    s1.addremove = false;
    var o;

    o = s1.option(form.Button, '_protocol_toggle', _('Protocol Status'));
    o.inputtitle = _('Enable Protocol');
    o.inputstyle = 'apply';
    o.onclick = function(ev) {};
    o.cfgvalue = function() { return ''; };
    o.write = function() {};
    o.render = function(option_index, section_id) {
        var enabled = uci.get('rs485-module', sid, 'protocol_enabled') !== '0';
        var btn = E('button', {
            'class': 'cbi-button',
            'data-port': String(portNum),
            'style': 'min-width:140px;color:#fff;border:none;border-radius:4px;padding:6px 18px;' +
                      'background-color:' + (enabled ? '#9e9e9e' : '#8FC320'),
            'click': function(ev) {
                var cur = uci.get('rs485-module', sid, 'protocol_enabled') !== '0';
                var next = !cur;
                uci.set('rs485-module', sid, 'protocol_enabled', next ? '1' : '0');
                ev.target.textContent = next ? _('Disable') : _('Enable');
                ev.target.style.backgroundColor = next ? '#9e9e9e' : '#8FC320';
                /* detail visibility is toggled by the render() wiring */
                var evt = new CustomEvent('protocol-toggle', { detail: { port: portNum, enabled: next } });
                ev.target.dispatchEvent(evt);
            }
        }, enabled ? _('Disable') : _('Enable'));

        return E('div', { 'class': 'cbi-value', 'id': 'cbi-rs485-module-' + sid + '-_protocol_toggle' }, [
            E('label', { 'class': 'cbi-value-title' }, _('Protocol Status')),
            E('div', { 'class': 'cbi-value-field' }, [btn])
        ]);
    };

    o = s1.option(form.ListValue, 'protocol', _('Protocol Type'),
        _('When enabled, decodes data according to the specified protocol.'));
    o.value('modbus-rtu',  _('Modbus RTU'));
    o.value('bacnet-mstp', _('BACnet MS/TP'));
    o.default = 'modbus-rtu';

    maps.push(m1);

    /* ===== Map 2: Modbus RTU / BACnet detail ===== */
    var m2 = new form.Map('rs485-module', '');

    /* ---- Modbus RTU section ---- */
    var sm = m2.section(form.NamedSection, sid, 'port', _('Modbus RTU'));
    sm.addremove = false;

    o = sm.option(form.Value, 'modbus_device_address', _('Device Address (Slave ID)'),
        _('Value can be entered in hexadecimal (0x) or decimal format.'));
    o.placeholder = '1'; o.default = '1'; o.rmempty = false;

    o = sm.option(form.ListValue, 'modbus_function_code', _('Function Code'));
    o.value('01','01 - Read Coils'); o.value('02','02 - Read Discrete Inputs');
    o.value('03','03 - Read Holding Registers'); o.value('04','04 - Read Input Registers');
    o.value('05','05 - Write Single Coil'); o.value('06','06 - Write Single Register');
    o.value('15','15 - Write Multiple Coils'); o.value('16','16 - Write Multiple Registers');
    o.default = '03';

    o = sm.option(form.Value, 'modbus_register_address', _('Start Register Address'),
        _('Multiple addresses can be separated by commas, e.g. 40001,40010,40020'));
    o.placeholder = '40001'; o.default = '40001'; o.rmempty = false;
    o.validate = function(section_id, value) {
        if (!value || value === '') return _('This field is required.');
        var parts = value.split(',').filter(function(p) { return p.trim() !== ''; });
        if (parts.length === 0) return _('This field is required.');
        for (var i = 0; i < parts.length; i++) {
            var addr = parts[i].trim();
            if (!/^\d+$/.test(addr)) return _('Each address must be a non-negative integer.');
            if (parseInt(addr,10) > 65535) return _('Each address must be between 0 and 65535.');
        }
        return true;
    };

    o = sm.option(form.Value, 'modbus_data_length', _('Register Count'),
        _('Number of registers to read/write. 1 register = 16 bits.'));
    o.datatype = 'range(1,125)'; o.placeholder = '10'; o.default = '10'; o.rmempty = false;

    o = sm.option(form.Flag, 'modbus_enable_crc', _('Enable CRC Check'));
    o.default = '1';

    o = sm.option(form.ListValue, 'modbus_work_mode', _('Work Mode'));
    o.value('once', _('Read Once')); o.value('periodic', _('Read Periodic'));
    o.default = 'once';

    o = sm.option(form.Value, 'modbus_poll_interval', _('Measurement Interval (s)'),
        _('Interval between periodic reads. Must be an integer between 1 and 3600.'));
    o.depends('modbus_work_mode', 'periodic');
    o.datatype = 'range(1,3600)'; o.default = '3'; o.rmempty = false;

    o = sm.option(form.Value, 'modbus_timeout', _('Timeout (x100ms)'),
        _('Timeout value in units of 100ms. Must be an integer between 1 and 1800.'));
    o.datatype = 'range(1,1800)'; o.default = '10';

    o = sm.option(form.Value, 'modbus_write_value', _('Write Value'));
    o.depends('modbus_function_code', '05');
    o.depends('modbus_function_code', '06');
    o.depends('modbus_function_code', '15');
    o.depends('modbus_function_code', '16');

    o = sm.option(form.Flag, 'modbus_standard_mode', _('Standard Mode'),
        _('Use standard Modbus protocol. Uncheck to use custom hex data mode.'));
    o.depends('modbus_function_code', '05');
    o.depends('modbus_function_code', '06');
    o.depends('modbus_function_code', '15');
    o.depends('modbus_function_code', '16');
    o.default = '1';

    o = sm.option(form.Button, '_modbus_read_btn', _('Read Data'));
    o.depends('modbus_work_mode', 'once');
    o.inputtitle = _('Read Data'); o.inputstyle = 'apply';
    o.onclick = L.bind(function(ev) {
        var btn = ev.target;
        var resultArea = document.getElementById('modbus_result_' + portNum);
        btn.disabled = true; btn.innerText = _('Reading...');
        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_read_'+portNum+' /tmp/rs485/modbus_result_'+portNum])
        .then(function(){return fs.exec('/bin/sh',['-c','mkdir -p /tmp/rs485 && touch /tmp/rs485/modbus_read_'+portNum]);})
        .then(function(){
            var n=0, timer=setInterval(function(){
                n++;
                L.resolveDefault(fs.read('/tmp/rs485/modbus_result_'+portNum)).then(function(c){
                    if(c){
                        clearInterval(timer);
                        if(resultArea){
                            if(c.startsWith('Error:')){resultArea.value=c;resultArea.style.color='#d00';}
                            else{try{resultArea.value=JSON.stringify(JSON.parse(c),null,4);}catch(e){resultArea.value=c;}resultArea.style.color='';}
                        }
                        btn.disabled=false;btn.innerText=_('Read Data');
                        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_read_'+portNum+' /tmp/rs485/modbus_result_'+portNum]);
                    } else if(n>=150){
                        clearInterval(timer);
                        if(resultArea){resultArea.value='Timeout: No response from Modbus device';resultArea.style.color='#d00';}
                        btn.disabled=false;btn.innerText=_('Read Data');
                        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_read_'+portNum+' /tmp/rs485/modbus_result_'+portNum]);
                    }
                });
            },100);
        });
    }, this);

    o = sm.option(form.Button, '_modbus_write_btn', _('Write Data'));
    o.depends('modbus_function_code', '05');
    o.depends('modbus_function_code', '06');
    o.depends('modbus_function_code', '15');
    o.depends('modbus_function_code', '16');
    o.inputtitle = _('Write Data'); o.inputstyle = 'apply';
    o.onclick = L.bind(function(ev) {
        var btn = ev.target;
        var resultArea = document.getElementById('modbus_result_' + portNum);
        btn.disabled = true; btn.innerText = _('Writing...');
        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_write_'+portNum+' /tmp/rs485/modbus_result_'+portNum])
        .then(function(){return fs.exec('/bin/sh',['-c','mkdir -p /tmp/rs485 && touch /tmp/rs485/modbus_write_'+portNum]);})
        .then(function(){
            var n=0, timer=setInterval(function(){
                n++;
                L.resolveDefault(fs.read('/tmp/rs485/modbus_result_'+portNum)).then(function(c){
                    if(c){
                        clearInterval(timer);
                        if(resultArea){
                            if(c.startsWith('Error:')){resultArea.value=c;resultArea.style.color='#d00';}
                            else{try{resultArea.value=JSON.stringify(JSON.parse(c),null,4);}catch(e){resultArea.value=c;}resultArea.style.color='';}
                        }
                        btn.disabled=false;btn.innerText=_('Write Data');
                        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_write_'+portNum+' /tmp/rs485/modbus_result_'+portNum]);
                    } else if(n>=150){
                        clearInterval(timer);
                        if(resultArea){resultArea.value='Timeout: No response from Modbus device';resultArea.style.color='#d00';}
                        btn.disabled=false;btn.innerText=_('Write Data');
                        fs.exec('/bin/sh',['-c','rm -f /tmp/rs485/modbus_write_'+portNum+' /tmp/rs485/modbus_result_'+portNum]);
                    }
                });
            },100);
        });
    }, this);

    o = sm.option(form.DummyValue, '_modbus_result', _('Frame Data'));
    o.rawhtml = true;
    o.cfgvalue = function() {
        return '<textarea id="modbus_result_' + portNum + '" readonly ' +
            'style="width:100%;min-height:120px;font-family:monospace;font-size:13px;' +
            'padding:8px;border:1px solid #ccc;border-radius:4px;white-space:pre;" ' +
            'placeholder="Frame data..."></textarea>';
    };

    /* ---- BACnet MS/TP section ---- */
    var sb = m2.section(form.NamedSection, sid, 'port', _('BACnet MS/TP'));
    sb.addremove = false;

    o = sb.option(form.Value, 'bacnet_mac_address', _('MAC Address'),
        _('BACnet MS/TP master MAC address for the gateway (0-127). It must be unique on the RS485 bus and must not match the target device MAC.'));
    o.datatype = 'range(0,127)'; o.placeholder = '2'; o.default = '2';

    o = sb.option(form.Value, 'bacnet_max_master', _('Max Master'),
        _('Maximum MS/TP master address on the network (1-127).'));
    o.datatype = 'range(1,127)'; o.placeholder = '127'; o.default = '127';

    o = sb.option(form.Value, 'bacnet_max_info_frames', _('Max Info Frames'),
        _('Maximum number of info frames before passing the token.'));
    o.datatype = 'range(1,100)'; o.placeholder = '1'; o.default = '1';

    o = sb.option(form.Value, 'bacnet_device_instance', _('Device Instance ID'),
        _('Unique BACnet device instance number (0-4194302).'));
    o.datatype = 'range(0,4194302)'; o.placeholder = '1002'; o.default = '1002';

    o = sb.option(form.Value, 'bacnet_device_name', _('Device Name'),
        _('Human-readable name for this BACnet device.'));
    o.placeholder = 'SenseCAP Gateway'; o.default = 'SenseCAP Gateway';

    o = sb.option(form.Value, 'bacnet_poll_interval', _('Poll Interval (s)'),
        _('Interval between BACnet polling cycles. Must be an integer between 1 and 3600.'));
    o.datatype = 'range(1,3600)'; o.placeholder = '10'; o.default = '10'; o.rmempty = false;

    o = sb.option(form.DummyValue, '_bacnet_targeted_read', _('Targeted Read Options'));
    o.render = function() {
        return E('div', { 'class': 'cbi-section-node' }, [
            bacnetManualReadRow(
                'target_device',
                _('Target Device Instance'),
                '1',
                _('Remote BACnet device instance. Leave blank to read all discovered devices.')
            ),
            bacnetManualReadRow(
                'object_type',
                _('Object Type'),
                'analog-input or 0',
                _('Fill this together with Object Instance and Property to issue a targeted ReadProperty.')
            ),
            bacnetManualReadRow(
                'object_instance',
                _('Object Instance'),
                '1',
                _('Object instance number for the targeted object.')
            ),
            bacnetManualReadRow(
                'property',
                _('Property'),
                'present-value or 85',
                _('Property name or BACnet property ID.')
            ),
            bacnetManualReadRow(
                'array_index',
                _('Array Index'),
                _('optional'),
                _('Optional BACnet array index for array-valued properties.')
            )
        ]);
    };

    o = sb.option(form.Button, '_bacnet_read_btn', _('Read Data'));
    o.inputtitle = _('Read Data'); o.inputstyle = 'apply';
    o.onclick = L.bind(function(ev) {
        var btn = ev.target;
        var resultArea = document.getElementById('bacnet_result_' + portNum);
        var triggerPath = '/tmp/rs485/bacnet_read_' + portNum;
        var resultPath = '/tmp/rs485/bacnet_result_' + portNum;
        var requestPath = '/tmp/rs485/bacnet_request_' + portNum;
        var requestPayload;

        try {
            requestPayload = buildBacnetRequestPayload();
        } catch (err) {
            setBacnetResult(resultArea, err.message || String(err), true);
            btn.disabled = false;
            btn.innerText = _('Read Data');
            return;
        }

        btn.disabled = true;
        btn.innerText = Object.keys(requestPayload).length > 0 ? _('Reading...') : _('Discovering...');

        fs.exec('/bin/sh',['-c','rm -f ' + triggerPath + ' ' + resultPath + ' ' + requestPath])
        .then(function(result) {
            return ensureExecSuccess(result, _('Failed to clean previous BACnet state'));
        })
        .then(function(){
            if (Object.keys(requestPayload).length > 0)
                return writeBacnetRequestFile(requestPath, requestPayload);

            return fs.exec('/bin/sh',['-c','mkdir -p /tmp/rs485']).then(function(result) {
                return ensureExecSuccess(result, _('Failed to prepare BACnet request directory'));
            });
        })
        .then(function(){
            return fs.exec('/bin/sh',['-c','mkdir -p /tmp/rs485 && touch ' + triggerPath]).then(function(result) {
                return ensureExecSuccess(result, _('Failed to trigger BACnet read'));
            });
        })
        .then(function(){
            var n=0, timer=setInterval(function(){
                n++;
                L.resolveDefault(fs.read(resultPath)).then(function(c){
                    if(c){
                        clearInterval(timer);
                        if(resultArea){
                            if(c.startsWith('Error:')){resultArea.value=c;resultArea.style.color='#d00';}
                            else{try{resultArea.value=JSON.stringify(JSON.parse(c),null,4);}catch(e){resultArea.value=c;}resultArea.style.color='';}
                        }
                        btn.disabled=false;btn.innerText=_('Read Data');
                        fs.exec('/bin/sh',['-c','rm -f ' + triggerPath + ' ' + resultPath + ' ' + requestPath]);
                    } else if(n>=450){
                        clearInterval(timer);
                        if(resultArea){resultArea.value='Timeout: No BACnet data returned';resultArea.style.color='#d00';}
                        btn.disabled=false;btn.innerText=_('Read Data');
                        fs.exec('/bin/sh',['-c','rm -f ' + triggerPath + ' ' + resultPath + ' ' + requestPath]);
                    }
                });
            },100);
        })
        .catch(function(err) {
            setBacnetResult(
                resultArea,
                (_('Failed to start BACnet read') + ': ' + ((err && err.message) ? err.message : String(err))),
                true
            );
            btn.disabled = false;
            btn.innerText = _('Read Data');
            fs.exec('/bin/sh',['-c','rm -f ' + triggerPath + ' ' + resultPath + ' ' + requestPath]);
        });
    }, this);

    o = sb.option(form.DummyValue, '_bacnet_result', _('Device Data'));
    o.rawhtml = true;
    o.cfgvalue = function() {
        return '<textarea id="bacnet_result_' + portNum + '" readonly ' +
            'style="width:100%;min-height:150px;font-family:monospace;font-size:13px;' +
            'padding:8px;border:1px solid #ccc;border-radius:4px;white-space:pre;" ' +
            'placeholder="BACnet device data will appear here..."></textarea>';
    };

    maps.push(m2);

    return maps;
}

/* ------------------------------------------------------------------
 * Show/hide Modbus vs BACnet sections based on protocol selection
 * ------------------------------------------------------------------ */
function updateDetailVisibility(detailEl, sid) {
    var enabled = uci.get('rs485-module', sid, 'protocol_enabled') !== '0';
    var proto = uci.get('rs485-module', sid, 'protocol');
    if (!proto || proto === 'none') proto = 'modbus-rtu';
    var sections = detailEl.querySelectorAll('.cbi-section');
    if (sections.length >= 2) {
        sections[0].style.display = (enabled && proto === 'modbus-rtu') ? '' : 'none';
        sections[1].style.display = (enabled && proto === 'bacnet-mstp') ? '' : 'none';
    }
}

/* ------------------------------------------------------------------
 * Main view  —  3 ports, each with 2 Maps + custom tab UI
 * ------------------------------------------------------------------ */
return view.extend({
    _allMaps: null,

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
        /* portMaps[i] = [m1, m2] for port i+1 */
        var portMaps = [buildPortMaps(1), buildPortMaps(2), buildPortMaps(3)];
        self._allMaps = [];
        portMaps.forEach(function(pair) {
            self._allMaps.push(pair[0], pair[1]);
        });

        /* Render all 6 maps */
        return Promise.all(self._allMaps.map(function(m) { return m.render(); }))
        .then(function(mapEls) {
            /* mapEls: [port1-config, port1-detail, port2-config, port2-detail, ...] */
            var portPanels = [];
            for (var i = 0; i < 3; i++) {
                var configEl = mapEls[i * 2];
                var detailEl = mapEls[i * 2 + 1];
                var sid = 'port' + (i + 1);

                /* Hide top-level h2 from sub-maps */
                var h2s = configEl.querySelectorAll('h2');
                h2s.forEach(function(h) { h.style.display = 'none'; });
                h2s = detailEl.querySelectorAll('h2');
                h2s.forEach(function(h) { h.style.display = 'none'; });

                /* Initial visibility */
                updateDetailVisibility(detailEl, sid);

                /* Listen for protocol dropdown change */
                (function(dEl, s) {
                    var sel = configEl.querySelector('select[id*="protocol"]');
                    if (sel) {
                        sel.addEventListener('change', function() {
                            uci.set('rs485-module', s, 'protocol', sel.value);
                            updateDetailVisibility(dEl, s);
                        });
                    }
                    /* Listen for enable/disable toggle */
                    var toggleBtn = configEl.querySelector('button[data-port]');
                    if (toggleBtn) {
                        toggleBtn.addEventListener('protocol-toggle', function() {
                            updateDetailVisibility(dEl, s);
                        });
                    }
                })(detailEl, sid);

                var panel = E('div', { 'class': 'rs485-port-panel' }, [
                    configEl,
                    detailEl
                ]);
                panel.style.display = (i === 0) ? '' : 'none';
                portPanels.push(panel);
            }

            /* Tab bar */
            var tabBar = E('ul', { 'class': 'cbi-tabmenu' });
            for (var t = 0; t < 3; t++) {
                var li = E('li', { 'class': (t === 0) ? 'cbi-tab' : 'cbi-tab-disabled' });
                li.appendChild(E('a', { 'href': 'javascript:void(0)' }, 'CH' + (t + 1)));
                tabBar.appendChild(li);
            }

            var tabItems = tabBar.querySelectorAll('li');
            function switchTab(activeIdx) {
                tabItems.forEach(function(tab) { tab.className = 'cbi-tab-disabled'; });
                tabItems[activeIdx].className = 'cbi-tab';
                portPanels.forEach(function(p) { p.style.display = 'none'; });
                portPanels[activeIdx].style.display = '';
            }
            tabItems.forEach(function(item, idx) {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchTab(idx);
                });
            });

            var wrapper = E('div', { 'class': 'cbi-map', 'id': 'rs485-protocol-tabs-wrapper' }, [
                E('h2', {}, _('Protocol Configuration')),
                E('div', { 'class': 'cbi-map-descr' },
                    _('Configure each RS485 port independently.')),
                tabBar
            ]);
            portPanels.forEach(function(p) { wrapper.appendChild(p); });
            return wrapper;
        });
    },

    handleSave: function(ev) {
        return Promise.all(this._allMaps.map(function(m) { return m.parse(); }))
            .then(function() { return uci.save(); });
    },

    handleSaveApply: function(ev, mode) {
        return this.handleSave(ev).then(function() {
            return ui.changes.apply(mode === '0');
        });
    },

    handleReset: null
});
