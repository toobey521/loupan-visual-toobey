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

    // 页面加载时: 若有全屏标记 → 自动尝试恢复全屏; 被浏览器拒绝时, 首次用户交互再恢复
    var wantFS = false;
    try { wantFS = localStorage.getItem(FS_KEY) === '1'; } catch (err) { }
    if (wantFS) {
        requestFS();
        var retry = function () {
            try {
                if (localStorage.getItem(FS_KEY) === '1') requestFS();
            } catch (err) { }
        };
        document.addEventListener('click', retry);
        document.addEventListener('touchstart', retry);
        document.addEventListener('keydown', retry);
    }
})();
