'use strict';

const expect = require('chai').expect;
const EddystoneBeaconScanner = require('./eddystone-beacon-scanner');
const scanner = new EddystoneBeaconScanner();

describe('EID Frame', () => {
  it('should compute the temporary key', () => {
    const temporaryKey = scanner.computeTempKey(1518080946);
    const expected = Buffer.from('b7c2d909d27d22df8343271162480210', 'hex');
    expect(temporaryKey.equals(expected)).to.be.true;
  });

  it('should compute the ephemeral key', () => {
    const temporaryKey = scanner.computeEid(1518080946, 12, Buffer.from('b7c2d909d27d22df8343271162480210', 'hex'));
    const expected = Buffer.from('7dd8169dae94258c', 'hex');
    expect(temporaryKey.equals(expected)).to.be.true;
  })
});

