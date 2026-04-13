'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require fs';
'require rpc';

var callFileList = rpc.declare({
    object: 'file',
    method: 'list',
    params: ['path'],
    expect: { entries: [] }
});

var callFileRead = rpc.declare({
    object: 'file',
    method: 'read',
    params: ['path'],
    expect: { data: '' }
});

var callFileRemove = rpc.declare({
    object: 'file',
    method: 'remove',
    params: ['path']
});

var PROFILE_DIR = '/etc/bacnet/profiles';

return view.extend({
    load: function() {
        return Promise.all([
            uci.load('bacnet'),
            L.resolveDefault(callFileList(PROFILE_DIR), [])
        ]);
    },

    render: function(data) {
        var profileEntries = data[1] || [];
        var m, s, o;

        m = new form.Map('bacnet', _('BACnet Gateway Configuration'),
            _('Configure the basic settings for the BACnet Gateway. The gateway integrates LoRaWAN devices with BACnet systems for seamless data exchange within building automation networks.'));

        /* ---- BACnet Settings Section ---- */
        s = m.section(form.NamedSection, 'gateway', 'gateway');
        s.addremove = false;

        o = s.option(form.DummyValue, '_bacnet_header');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<h3 style="margin-top:0;padding-top:10px;">BACnet</h3>';
        };

        o = s.option(form.Button, '_toggle_bacnet', _('BACnet Gateway Status'));
        o.inputtitle = function() {
            var enabled = uci.get('bacnet', 'gateway', 'enabled');
            return enabled === '1' ? _('Disable BACnet Gateway') : _('Enable BACnet Gateway');
        };
        o.inputstyle = function() {
            var enabled = uci.get('bacnet', 'gateway', 'enabled');
            return enabled === '1' ? 'reset' : 'apply';
        };
        o.onclick = function(ev) {
            var currentEnabled = uci.get('bacnet', 'gateway', 'enabled');
            if (currentEnabled === '1') {
                uci.set('bacnet', 'gateway', 'enabled', '0');
                ev.target.textContent = _('Enable BACnet Gateway');
                ev.target.className = 'cbi-button cbi-button-apply';
            } else {
                uci.set('bacnet', 'gateway', 'enabled', '1');
                ev.target.textContent = _('Disable BACnet Gateway');
                ev.target.className = 'cbi-button cbi-button-reset';
            }
        };
        o.description = _('Enable or disable the BACnet Gateway service.');

        o = s.option(form.Value, 'device_name', _('Device Name'),
            _('The name of the gateway as it will appear in the BACnet network.'));
        o.placeholder = 'SenseCAP Gateway';
        o.default = 'SenseCAP Gateway';
        o.rmempty = false;

        o = s.option(form.Value, 'device_id', _('Device ID'),
            _('A unique Device Instance for the BACnet network. The ID range is 1 to 4194303.'));
        o.datatype = 'range(1,4194303)';
        o.placeholder = '8000';
        o.default = '8000';
        o.rmempty = false;

        o = s.option(form.ListValue, 'local_endpoint', _('Local Endpoint'),
            _('Specifies the IP interface that the BACnet Gateway uses for UDP communication.'));
        o.value('0.0.0.0', _('Any Port : 0.0.0.0'));
        o.default = '0.0.0.0';

        o = s.option(form.Value, 'port', _('Port'),
            _('BACnet/IP UDP port number.'));
        o.datatype = 'port';
        o.placeholder = '47808';
        o.default = '47808';
        o.rmempty = false;

        o = s.option(form.Flag, 'whitelist', _('Whitelist'),
            _('When enabled, only whitelisted BACnet clients can access the gateway.'));
        o.default = '0';

        o = s.option(form.DynamicList, 'whitelist_addresses', _('Whitelisted Addresses'),
            _('IP addresses allowed to access this BACnet device.'));
        o.datatype = 'ipaddr';
        o.depends('whitelist', '1');
        o.placeholder = '192.168.1.100';

        /* ---- Equipment Profiles Section ---- */
        o = s.option(form.DummyValue, '_profile_header');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<h3 style="margin-top:20px;padding-top:10px;">Manage Equipment Profiles</h3>' +
                   '<p style="color:#888;font-size:0.9em;">' +
                   _('Import and manage configuration profiles for LoRaWAN devices. The BACnet Gateway depends on these profiles to accurately map LoRaWAN data to BACnet objects.') +
                   '</p>';
        };

        o = s.option(form.DummyValue, '_default_profiles');
        o.rawhtml = true;
        o.cfgvalue = function() {
            var defaultProfiles = (uci.get('bacnet', 'gateway', 'default_profiles') || '').split(/\s+/).filter(Boolean);
            if (defaultProfiles.length === 0) {
                defaultProfiles = ['Senso8-LRS10701', 'Senso8-LRS20100', 'Senso8-LRS20200',
                                   'Senso8-LRS20310', 'Senso8-LRS20600', 'Senso8-LRS20LD0',
                                   'Senso8-LRS20Uxx', 'Senso8-LRS2M001'];
            }
            var tags = defaultProfiles.map(function(p) {
                return '<span style="display:inline-block;padding:4px 12px;margin:3px;border:1px solid #ddd;border-radius:16px;font-size:0.9em;background:#f7f7f7;">' +
                       p + '</span>';
            }).join('');
            return '<div style="margin-bottom:10px;">' +
                   '<strong>' + _('Default Profiles') + '</strong>' +
                   '<span style="color:#888;margin-left:8px;font-size:0.85em;">' + _('These are default profiles and cannot be deleted.') + '</span>' +
                   '</div>' +
                   '<div>' + tags + '</div>';
        };

        o = s.option(form.DummyValue, '_imported_profiles');
        o.rawhtml = true;
        o.cfgvalue = function() {
            var importedList = profileEntries.filter(function(e) { return e.type === 'file'; });

            if (importedList.length === 0) {
                return '<div style="margin-top:15px;">' +
                       '<strong>' + _('Imported Profiles') + '</strong>' +
                       '<p style="color:#888;font-size:0.9em;">' + _('No profiles available') + '</p>' +
                       '</div>';
            }

            var tags = importedList.map(function(f) {
                return '<span style="display:inline-block;padding:4px 12px;margin:3px;border:1px solid #4caf50;border-radius:16px;font-size:0.9em;color:#4caf50;background:#f1f8e9;">'+
                       f.name.replace(/\.yaml$|\.yml$/, '') +
                       ' <a href="#" data-profile="' + f.name + '" class="bacnet-remove-profile" style="color:#e53e3e;text-decoration:none;margin-left:4px;font-weight:bold;">&times;</a>' +
                       '</span>';
            }).join('');

            return '<div style="margin-top:15px;">' +
                   '<strong>' + _('Imported Profiles') + '</strong>' +
                   '</div>' +
                   '<div style="margin-top:5px;">' + tags + '</div>';
        };

        o = s.option(form.Button, '_upload_profile');
        o.inputtitle = _('Upload YAML Profile');
        o.inputstyle = 'apply';
        o.onclick = function() {
            var fileInput = E('input', {
                'type': 'file',
                'accept': '.yaml,.yml',
                'style': 'margin:10px 0;display:block;'
            });

            var uploadBtn = E('button', {
                'class': 'cbi-button cbi-button-apply',
                'disabled': 'disabled',
                'style': 'margin-top:8px;'
            }, _('Add'));

            fileInput.addEventListener('change', function() {
                if (fileInput.files.length > 0)
                    uploadBtn.removeAttribute('disabled');
                else
                    uploadBtn.setAttribute('disabled', 'disabled');
            });

            uploadBtn.addEventListener('click', function() {
                var file = fileInput.files[0];
                if (!file) return;

                ui.hideModal();

                var reader = new FileReader();
                reader.onload = function(e) {
                    var content = e.target.result;
                    var filename = file.name;

                    fs.write(PROFILE_DIR + '/' + filename, content).then(function() {
                        ui.addNotification(null, E('p', _('Profile "%s" uploaded successfully.').format(filename)), 'info');
                        window.location.reload();
                    }).catch(function(err) {
                        ui.addNotification(null, E('p', _('Failed to upload profile: %s').format(err.message)), 'danger');
                    });
                };
                reader.readAsText(file);
            });

            ui.showModal(_('Import Profile'), [
                E('p', _('Choose a YAML profile file to upload.')),
                fileInput,
                E('div', { 'style': 'display:flex;justify-content:space-between;margin-top:10px;' }, [
                    uploadBtn,
                    E('button', {
                        'class': 'cbi-button',
                        'click': ui.hideModal
                    }, _('Cancel'))
                ])
            ]);
        };

        return m.render().then(function(node) {
            node.addEventListener('click', function(ev) {
                var target = ev.target;
                if (target.classList.contains('bacnet-remove-profile')) {
                    ev.preventDefault();
                    var profileName = target.getAttribute('data-profile');
                    ui.showModal(_('Remove Profile'), [
                        E('p', _('Are you sure you want to remove profile "%s"?').format(profileName)),
                        E('div', { 'style': 'display:flex;justify-content:space-between;margin-top:10px;' }, [
                            E('button', {
                                'class': 'cbi-button cbi-button-negative',
                                'click': function() {
                                    ui.hideModal();
                                    callFileRemove(PROFILE_DIR + '/' + profileName).then(function() {
                                        ui.addNotification(null, E('p', _('Profile removed.')), 'info');
                                        window.location.reload();
                                    }).catch(function(err) {
                                        ui.addNotification(null, E('p', _('Failed to remove: %s').format(err.message)), 'danger');
                                    });
                                }
                            }, _('Remove')),
                            E('button', {
                                'class': 'cbi-button',
                                'click': ui.hideModal
                            }, _('Cancel'))
                        ])
                    ]);
                }
            });

            return node;
        });
    }
});
