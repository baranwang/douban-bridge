import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { apiKeyActionUi } from "../src/components/rex/api-key-action";

describe("api key generate/revoke ui", () => {
  test("disables generate until GET status has loaded", () => {
    const ui = apiKeyActionUi({ loaded: false, hasKey: false, busy: false });
    assert.equal(ui.disabled, true);
    assert.equal(ui.label, "生成密钥");
    assert.equal(ui.showRetry, false);
  });

  test("uses real hasKey after status loads", () => {
    const withoutKey = apiKeyActionUi({ loaded: true, hasKey: false, busy: false });
    assert.equal(withoutKey.disabled, false);
    assert.equal(withoutKey.label, "生成密钥");
    assert.equal(withoutKey.showRetry, false);

    const withKey = apiKeyActionUi({ loaded: true, hasKey: true, busy: false });
    assert.equal(withKey.disabled, false);
    assert.equal(withKey.label, "重新生成密钥");
    assert.equal(withKey.showRetry, false);
  });

  test("stays disabled while busy even after load", () => {
    const ui = apiKeyActionUi({ loaded: true, hasKey: true, busy: true });
    assert.equal(ui.disabled, true);
    assert.equal(ui.label, "重新生成密钥");
    assert.equal(ui.showRetry, false);
  });

  test("failed GET keeps generate disabled and offers retry instead of silent rotate", () => {
    const ui = apiKeyActionUi({ loaded: false, hasKey: false, busy: false, loadFailed: true });
    assert.equal(ui.disabled, true);
    assert.equal(ui.label, "生成密钥");
    assert.equal(ui.showRetry, true);
  });
});
