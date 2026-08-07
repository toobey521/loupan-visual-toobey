/* ===== 全屏保持 (Toobey) =====
 * F 进入全屏 → localStorage 标记 → 跳转其他页面自动恢复全屏
 * Esc 退出全屏 → 清除标记 (后续页面不再自动全屏)
 */
(function () {
    var FS_KEY = 'loupan_fs';
    var inited = false;

    function requestFS() {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(function () { });
        }
    }
    function exitFS() {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(function () { });
        }
    }

    // F 全屏 / Esc 退出
    document.addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') {
            if (!document.fullscreenElement) {
                try { localStorage.setItem(FS_KEY, '1'); } catch (err) { }
                requestFS();
            }
        }
        if (e.key === 'Escape' && document.fullscreenElement) {
            try { localStorage.removeItem(FS_KEY); } catch (err) { }
            exitFS();
        }
    });

    // 全屏状态变化 → 同步标记
    document.addEventListener('fullscreenchange', function () {
        try {
            if (document.fullscreenElement) localStorage.setItem(FS_KEY, '1');
            else localStorage.removeItem(FS_KEY);
        } catch (err) { }
    });

    // 页面加载时: 若有全屏标记 → 自动尝试恢复全屏; 被浏览器拒绝时, 显示"恢复全屏"按钮 + 首次交互自动恢复
    var wantFS = false;
    try { wantFS = localStorage.getItem(FS_KEY) === '1'; } catch (err) { }
    if (wantFS) {
        requestFS();
        // 恢复全屏悬浮按钮 (右下角, 全屏后自动隐藏)
        var fsBtn = document.createElement('button');
        fsBtn.id = 'fsRestoreBtn';
        fsBtn.textContent = '🔳 恢复全屏';
        fsBtn.style.cssText = 'position:fixed;right:22px;bottom:30px;z-index:9999;padding:10px 20px;' +
            'border:1px solid rgba(0,200,255,0.55);background:rgba(10,18,40,0.94);color:#7fd8ff;' +
            'border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;' +
            'box-shadow:0 6px 24px rgba(0,0,0,0.5),0 0 16px rgba(0,200,255,0.3);' +
            'transition:all 0.25s;';
        fsBtn.onmouseover = function () { fsBtn.style.background = 'rgba(0,200,255,0.25)'; };
        fsBtn.onmouseout = function () { fsBtn.style.background = 'rgba(10,18,40,0.94)'; };
        fsBtn.onclick = function () {
            try { localStorage.setItem(FS_KEY, '1'); } catch (err) { }
            requestFS();
            fsBtn.style.display = 'none';
        };
        document.body.appendChild(fsBtn);

        // 任意交互自动恢复全屏
        var retry = function () {
            try {
                if (localStorage.getItem(FS_KEY) === '1') requestFS();
            } catch (err) { }
        };
        document.addEventListener('click', retry);
        document.addEventListener('touchstart', retry);
        document.addEventListener('keydown', retry);

        // 进入全屏后隐藏按钮
        document.addEventListener('fullscreenchange', function () {
            if (document.fullscreenElement) fsBtn.style.display = 'none';
        });
    }
})();
