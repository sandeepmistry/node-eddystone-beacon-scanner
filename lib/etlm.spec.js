//'use strict';

const expect = require('chai').expect;

const EddystoneBeaconScanner = require('./eddystone-beacon-scanner');
const scanner = new EddystoneBeaconScanner();

const CryptoJS = require('./eax');

function encryptFrame(frame, seconds, scaler, salt) {



  const nonce = Buffer.alloc(6);
  nonce.writeUInt32BE((seconds >> scaler) << scaler); // Time base.
  nonce.writeUInt16BE(salt, 4); // Salt.

  const key = CryptoJS.enc.Hex.parse("00112233445566778899AABBCCDDEEFF");
  let cipher = CryptoJS.EAX.create(key, {tagLength: 2});
  // 12 bytes frame.
  const rawFrame = CryptoJS.enc.Hex.parse(frame);

  const result = cipher.encrypt(rawFrame, CryptoJS.enc.Hex.parse(nonce.toString('hex')));

  const encrypted = Buffer.from(result.toString(), 'hex');

  const encryptedFrame = Buffer.alloc(18);

  encrypted.copy(encryptedFrame, 2, 0, 12);
  encryptedFrame.writeUInt16BE(salt, 14);
  encrypted.copy(encryptedFrame, 16, 12, 14);

  return encryptedFrame;

}
describe('eTML Frame', () => {
  it('should be decrypted', done => {

    const seconds = 1518080946;
    const scaler = 4;
    const salt = 65535;

    const frame = encryptFrame("FFEEDDCCBBAA998877665544", seconds, scaler, salt);

    const decrypted = scanner.decryptTlm(frame, seconds, scaler);

    expect(decrypted.toString('hex')).to.equal("ffeeddccbbaa998877665544");

    done();
  });
});
