import { describe, it, expect } from 'vitest';
import { parseAndValidateToken } from '../src/token.js';
import { SignJWT, importPKCS8 } from 'jose';

describe('RSA256', async () => {
  const PROJECT_ID = 'test-project';
  const privateKey = `-----BEGIN PRIVATE KEY-----
    MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCvUGdiL2Gs8j86
    36MbDnY1kYBtrG80zPj1jBXxva+jX8F/1gFmPYJs+73AlGfjnq0UYmML29VNyXfO
    F3VISlnQ5s0D9OduIXwQX/tOSOi6DY8QJRl9uZ9HoRFYDfbb6O6hs4VonRqey5b9
    uGWxuipCHtkBnpf0+xhOF5ljbHGoRTliqT+ySCxPMoqbN6nI+szuVFkWapuaRUZ0
    z8tj/K/QUTG2SWQxZFIvjbwxaBYq2XzDE8lq3SCDtDy2Q8WPYy6Y7yRD3Gyuwp4P
    e6ooFC5GRFU7eTt9OeyLcGG7+0yQTgLDeSX8ubPrQm1hGpbtZzu8Gf6o7iEtSj3v
    IB7W3YNTAgMBAAECggEAIOTEqRL70C/ZtkmsuFBj1JQ61Rkj+nO1CJliqqttD4nR
    bBNyysSiuqEXTtFplrc4gVkefWSfZot1G6miG1C7/mq3r9TdMXg953Ki2+LpK7OM
    krprSIAyBwYNE4j3NvbDA3sD/odvrbjEWVGmXwzvjd1s2RVxLImKW2ipIpL/1lLr
    HvwYOipx0IOmoJNRbVRT37hqShCBL0yv2VCACKWbVD0XRDggnu8ipPeJhbt1EIfJ
    HnWs0v+JwKlvB8bLvpDtE9E8IwhOAluJVkGA8J9LBcDHscwXm1kXBkdzhmkcX5Rj
    Xxpd6SkziOGu74RM/iG0LhufpXA25PYJlwbZWaJHyQKBgQDfiNOEyeprA7gvi8WO
    0tr5XE/ZB33E+RTtx7OIEi+zQns5ghO99P03zeByGD9voUxy4Par2ZzRc+lXysMy
    t/w7rBJyGstN3d/in43kRYG+b8Nm9OG3mTHuA58YcHd2TW8zd/x3lX2dokON2L9J
    PFh5QbEAaqPb7yK27ZAXGQfDWwKBgQDIxrVM2ndM4FAvG1r0YYDJUOknhAvdI78+
    lGQcvS6OEjmeh8TAahr6HC32CUY9DEwEmb2ySKiQmHRd4kshht73kr2n5sqAbrve
    nXk5esOTspMDWnJ4S7yUkJ0w5efFt3Nv5xfa2eHajcwxe3GprnYr1hcjYgyuX+8+
    CM8SkVeZaQKBgDtArbDZRQYw6jXQOwHs6paG3bONxMzdqaqN8Qz0pShDSx6nWExW
    EHkmXYRg4Q/aFcWt1DUhbewnaYcX/D4JfxbiOdF9QL7XPW15FceYlRfB0G4OI3bj
    aNTKqPV1enUleYCPIaEhQzbxuC51cd8b2+fofd66Zcz6ypzqw/Mbc29ZAoGADLeB
    Tj/cJJNkoMczyJzQYm/shKM5eSVFfLo7aRKWe0suORtSW/mcgdD9HENUHpPD0NrI
    CB3QB3CQlk26AoKfZsD1oEfe9amN3rjMr9ZVwuoho6m77GCnriVGv40gVAadmi3h
    9eutAYHPuCageWXieD5UMtqIARd0eNJoAz4PdVkCgYBleOVxgKN+T1gzAawHOWep
    pDb0OdGbpJa8wFkjs4Y4I39yz9h6Gyn6QK/KueLKFYCCdpWD+T2abLGzurI2yiTd
    AMkraAGpq1v2ile/ewspHcKwAVbGO9BAXvHWxGoQKMlPTcmboPqDboQ5uB4f3B6y
    9kvUxBrbcyrhlWw8nKv8EA==
    -----END PRIVATE KEY-----`;
  const publicKey = `-----BEGIN PUBLIC KEY-----
    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr1BnYi9hrPI/Ot+jGw52
    NZGAbaxvNMz49YwV8b2vo1/Bf9YBZj2CbPu9wJRn456tFGJjC9vVTcl3zhd1SEpZ
    0ObNA/TnbiF8EF/7Tkjoug2PECUZfbmfR6ERWA322+juobOFaJ0ansuW/bhlsboq
    Qh7ZAZ6X9PsYTheZY2xxqEU5Yqk/skgsTzKKmzepyPrM7lRZFmqbmkVGdM/LY/yv
    0FExtklkMWRSL428MWgWKtl8wxPJat0gg7Q8tkPFj2MumO8kQ9xsrsKeD3uqKBQu
    RkRVO3k7fTnsi3Bhu/tMkE4Cw3kl/Lmz60JtYRqW7Wc7vBn+qO4hLUo97yAe1t2D
    UwIDAQAB
    -----END PUBLIC KEY-----`;
  const tokenPayload = {
    'x-triplit-token-type': 'test',
    'x-triplit-project-id': PROJECT_ID,
  };
  const ALG = 'RS256';

  const jwt = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('1 hr')
    .sign(await importPKCS8(privateKey, ALG));

  it('can parse a valid token using public key', async () => {
    const result = await parseAndValidateToken(jwt, publicKey, PROJECT_ID);
    expect(result.error).toBeUndefined();
  });
  it('can parse a valid token using JWK public key', async () => {
    const publicJWK = {
      kty: 'RSA',
      n: 'r1BnYi9hrPI_Ot-jGw52NZGAbaxvNMz49YwV8b2vo1_Bf9YBZj2CbPu9wJRn456tFGJjC9vVTcl3zhd1SEpZ0ObNA_TnbiF8EF_7Tkjoug2PECUZfbmfR6ERWA322-juobOFaJ0ansuW_bhlsboqQh7ZAZ6X9PsYTheZY2xxqEU5Yqk_skgsTzKKmzepyPrM7lRZFmqbmkVGdM_LY_yv0FExtklkMWRSL428MWgWKtl8wxPJat0gg7Q8tkPFj2MumO8kQ9xsrsKeD3uqKBQuRkRVO3k7fTnsi3Bhu_tMkE4Cw3kl_Lmz60JtYRqW7Wc7vBn-qO4hLUo97yAe1t2DUw',
      e: 'AQAB',
      alg: ALG,
      use: 'sig',
    };
    const jwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJpYXQiOjE3MDMyMTYzNzYsImV4cCI6MTgwOTIxNjk3NiwieC10cmlwbGl0LXRva2VuLXR5cGUiOiJ0ZXN0IiwieC10cmlwbGl0LXByb2plY3QtaWQiOiJ0ZXN0LXByb2plY3QifQ.a_PHHxS7woDMfelrU_w8m9ZZsUVmkQUVrBJg_xEXlnf0AFWZtsBw5ZMfsvV4XuTWxjl51GXhxGJwWJ6WoEPwYTEMUnj-kijKTKZTZn9Cut_F_Jx6iG_ub2TgICbWbDsd9VRYA-jF52dw_spU5keb-tuYOeg6HMEnw58OiunCfIjEWJYXh1DXF4yVxeuo1TuHEEx6IrMUpWVzkNnaoKG5MaZXN9Jzgh3oQvagvos4ImETH5dP_HBfqXM5fbHIF3fKCsnY9pVg176CvaCrLufcw2ZZF90GHCe2HdIahWzEchy_vnYJyZKfrENWfqCBy_LschgwIAI8hPjph3tb8Tnf8w';
    const result = await parseAndValidateToken(
      jwt,
      JSON.stringify(publicJWK),
      PROJECT_ID
    );
    expect(result.error).toBeUndefined();
  });
});

describe('HS256', async () => {
  const PROJECT_ID = 'test-project';
  const secret =
    'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2';
  const tokenPayload = {
    'x-triplit-token-type': 'test',
    'x-triplit-project-id': PROJECT_ID,
  };
  const jwt = await new SignJWT(tokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1 hr')
    .sign(new TextEncoder().encode(secret));
  it('can parse and validate a token with symetrical key', async () => {
    const result = await parseAndValidateToken(jwt, secret, PROJECT_ID);
    expect(result.error).toBeUndefined();
  });
});
