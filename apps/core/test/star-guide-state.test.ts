import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { starGuideUi } from "../src/components/star-guide-state";

describe("star guide dialog footer", () => {
  test("还没去 GitHub 时是打开仓库的主按钮", () => {
    const ui = starGuideUi({ opened: false, validating: false, checked: false, starred: false });
    assert.equal(ui.label, "打开 GitHub 仓库");
    assert.equal(ui.disabled, false);
    assert.equal(ui.showNotFound, false);
  });

  test("刚点完按钮、请求尚未起飞也算确认中", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: false, starred: false });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });

  test("请求进行中禁用按钮", () => {
    const ui = starGuideUi({ opened: true, validating: true, checked: false, starred: false });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });

  test("检查完成但仍未 star 时给出手动重试与提示", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: true, starred: false });
    assert.equal(ui.label, "我已 Star，立即检查");
    assert.equal(ui.disabled, false);
    assert.equal(ui.showNotFound, true);
  });

  test("已 star 时保持禁用，避免跳转途中重复点击", () => {
    const ui = starGuideUi({ opened: true, validating: false, checked: true, starred: true });
    assert.equal(ui.label, "确认中…");
    assert.equal(ui.disabled, true);
    assert.equal(ui.showNotFound, false);
  });
});
