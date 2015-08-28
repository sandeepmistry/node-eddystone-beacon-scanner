var EddystoneBeaconScanner = require('../'); // use require('uri-beacon-scanner'), if installed from npm

EddystoneBeaconScanner.on('discover', function(uriBeacon) {
  console.log('discovered Eddystone Beacon:');
  console.log(uriBeacon);
});

EddystoneBeaconScanner.startScanning(true);
