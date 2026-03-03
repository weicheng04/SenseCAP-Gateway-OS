'use strict';
'require baseclass';
'require fs';
'require rpc';
'require uci';

var callLuciVersion = rpc.declare({
	object: 'luci',
	method: 'getVersion'
});

var callSystemBoard = rpc.declare({
	object: 'system',
	method: 'board'
});

var callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info'
});

return baseclass.extend({
	title: _('System'),

	load: function() {
		var normalizeQuotedValue = function(raw) {
			if (!raw)
				return '';

			var val = raw.trim();

			if (!val)
				return '';

			if (val.charAt(0) === '"' && val.charAt(val.length - 1) === '"')
				val = val.slice(1, -1);

			if (val.toLowerCase() === 'not supported')
				return '';

			return val;
		};

		// Get LTE device from config
		var lteDevice = uci.get('network', 'LTE', 'device') || '/dev/cdc-wdm0';

		// Check if LTE data session is connected
		var checkLTE = fs.exec('/sbin/uqmi', ['-s', '-d', lteDevice, '--get-data-status']).then(function(res) {
			var status = normalizeQuotedValue(res.stdout).toLowerCase();
			if (status)
				return (status === 'connected');

			throw new Error('Empty data status');
		}).catch(function() {
			// Fallback to interface operstate if data status is unavailable
			return fs.exec('/bin/cat', ['/sys/class/net/wwan0/operstate']).then(function(res) {
				var state = res.stdout ? res.stdout.trim() : '';
				return (state === 'up' || state === 'unknown');
			}).catch(function() {
				return false;
			});
		});

		// Get LTE IMEI using uqmi
		var getIMEI = checkLTE.then(function(isConnected) {
			if (!isConnected) return '';
			// First try to read from deviceinfo
			return fs.exec('/bin/cat', ['/etc/deviceinfo/imei']).then(function(res) {
				if (res.stdout && res.stdout.trim()) {
					return res.stdout.trim();
				}
				throw new Error('No IMEI in deviceinfo');
			}).catch(function() {
				// Use uqmi to get IMEI (ESN/IMEI via DMS)
				return fs.exec('/sbin/uqmi', ['-s', '-d', lteDevice, '--get-imei']).then(function(res) {
					var match = res.stdout.match(/"imei":\s*"([^"]+)"/i);
					if (match)
						return match[1];

					return normalizeQuotedValue(res.stdout);
				}).catch(function() {
					return '';
				});
			});
		});

		// Get LTE ICCID using uqmi
		var getICCID = checkLTE.then(function(isConnected) {
			if (!isConnected) return '';
			// First try to read from deviceinfo
			return fs.exec('/bin/cat', ['/etc/deviceinfo/iccid']).then(function(res) {
				if (res.stdout && res.stdout.trim()) {
					return res.stdout.trim();
				}
				throw new Error('No ICCID in deviceinfo');
			}).catch(function() {
				// Use uqmi to get ICCID
				return fs.exec('/sbin/uqmi', ['-s', '-d', lteDevice, '--get-iccid']).then(function(res) {
					var match = res.stdout.match(/"iccid":\s*"([^"]+)"/i);
					if (match)
						return match[1];

					return normalizeQuotedValue(res.stdout);
				}).catch(function() {
					return '';
				});
			});
		});

		// Get LTE RSSI using uqmi
		var getRSSI = checkLTE.then(function(isConnected) {
			if (!isConnected) return '';
			return fs.exec('/sbin/uqmi', ['-s', '-d', lteDevice, '--get-signal-info']).then(function(res) {
				// Parse JSON output for RSSI
				var rssiMatch = res.stdout.match(/"rssi":\s*(-?\d+)/i);
				if (rssiMatch) {
					return rssiMatch[1];
				}
				// Try alternative: signal strength in other format
				var strengthMatch = res.stdout.match(/"signal_strength":\s*(-?\d+)/i);
				if (strengthMatch) {
					return strengthMatch[1];
				}
				return '';
			}).catch(function() {
				return '';
			});
		});

		return Promise.all([
			L.resolveDefault(callSystemBoard(), {}),
			L.resolveDefault(callSystemInfo(), {}),
			L.resolveDefault(callLuciVersion(), { revision: _('unknown version'), branch: 'LuCI' }),
			fs.exec('/bin/cat', ['/etc/deviceinfo/sn']).then(function(res) {
				return res.stdout || '';
			}).catch(function() {
				return '';
			}),
			fs.exec('/bin/cat', ['/etc/deviceinfo/eui']).then(function(res) {
				return res.stdout || '';
			}).catch(function() {
				return '';
			}),
			fs.exec('/bin/cat', ['/version.txt']).then(function(res) {
				return res.stdout || '';
			}).catch(function() {
				return '';
			}),
			fs.exec('/bin/cat', ['/etc/deviceinfo/freq_plan']).then(function(res) {
				return res.stdout || '';
			}).catch(function() {
				return '';
			}),
			checkLTE,
			getIMEI,
			getICCID,
			getRSSI
		]);
	},

	render: function(data) {
		var boardinfo   = data[0],
		    systeminfo  = data[1],
		    luciversion = data[2],
		    sn          = data[3] ? data[3].trim() : '',
		    eui         = data[4] ? data[4].trim() : '',
		    versionText = data[5] || '',
		    freqPlan    = data[6] ? data[6].trim() : '',
		    lteConnected = data[7] || false,
		    imei        = data[8] || '',
		    iccid       = data[9] || '',
		    rssi        = data[10] || '';

		// Parse version.txt - only extract version number
		var firmwareVersion = '';
		if (versionText) {
			var lines = versionText.split('\n');
			for (var i = 0; i < lines.length; i++) {
				if (lines[i].indexOf('Version:') === 0) {
					firmwareVersion = lines[i].replace('Version:', '').trim();
					break;
				}
			}
		}

		luciversion = luciversion.branch + ' ' + luciversion.revision;

		var datestr = null;

		if (systeminfo.localtime) {
			var date = new Date(systeminfo.localtime * 1000);

			datestr = '%04d-%02d-%02d %02d:%02d:%02d (UTC)'.format(
				date.getUTCFullYear(),
				date.getUTCMonth() + 1,
				date.getUTCDate(),
				date.getUTCHours(),
				date.getUTCMinutes(),
				date.getUTCSeconds()
			);
		}

		var fields = [
			_('Hostname'),         boardinfo.hostname,
			_('Model'),            boardinfo.model,
			_('SN'),               sn || '-',
			_('EUI'),              eui || '-',
			_('Build Version'),    (L.isObject(boardinfo.release) ? boardinfo.release.description + ' / ' : '') + (luciversion || ''),
			_('OS Version'),       (L.isObject(boardinfo.release) ? boardinfo.release.target : ''),
			_('Target Platform'),  (L.isObject(boardinfo.release) ? boardinfo.release.target : ''),
			_('Firmware Version'), firmwareVersion || '-',
			_('Kernel Version'),   boardinfo.kernel,
			_('LoRaWAN Region'),   freqPlan || '-'
		];

		// Only add LTE fields if connected
		if (lteConnected) {
			fields.push(
				_('IMEI'),             imei || '-',
				_('ICCID'),            iccid || '-',
				_('LTE RSSI'),         (rssi !== '') ? rssi + 'dBm' : '-'
			);
		}

		fields.push(
			_('Local Time'),       datestr,
			_('Uptime'),           systeminfo.uptime ? '%t'.format(systeminfo.uptime) : null,
			_('Load Average'),     Array.isArray(systeminfo.load) ? '%.2f, %.2f, %.2f'.format(
				systeminfo.load[0] / 65535.0,
				systeminfo.load[1] / 65535.0,
				systeminfo.load[2] / 65535.0
			) : null
		);

		var table = E('table', { 'class': 'table', 'id': 'system-status-table' });

		for (var i = 0; i < fields.length; i += 2) {
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ fields[i] ]),
				E('td', { 'class': 'td left' }, [ (fields[i + 1] != null) ? fields[i + 1] : '?' ])
			]));
		}

		// Start auto refresh timer (runs independently of main status poll)
		if (!window._systemStatusRefreshTimer) {
			var self = this;
			window._systemStatusRefreshTimer = window.setInterval(function() {
				self.load().then(function(data) {
					var container = document.getElementById('system-status-table');
					if (container) {
						var newTable = self.render(data);
						container.parentNode.replaceChild(newTable, container);
					}
				}).catch(function(err) {
					console.log('System status refresh error:', err);
				});
			}, 5000);
		}

		return table;
	}
});
