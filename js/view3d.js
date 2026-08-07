/* ===== 楼盘 3D 实景巡航 (Toobey) =====
 * Three.js 无人机视角: 推拉/盘旋/环绕 自动巡航 + 房号定位 + 详情跳转
 */
(function () {
    if (typeof THREE === 'undefined') return;

    var canvas = document.getElementById('view3d');
    if (!canvas) return;

    var UNITS = window.UNITS || [];
    var HOTSPOTS = window.BUILDINGS_HOTSPOTS || [];

    // ---------- 场景 ----------
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b18);
    scene.fog = new THREE.Fog(0x060b18, 180, 380);

    var camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.5, 600);
    camera.position.set(70, 55, 95);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;

    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 12;
    controls.maxDistance = 220;
    controls.target.set(50, 0, 50);

    // ---------- 灯光 ----------
    scene.add(new THREE.AmbientLight(0x223355, 0.9));
    var dir = new THREE.DirectionalLight(0x9fc8ff, 1.1);
    dir.position.set(60, 90, 40);
    scene.add(dir);
    var p1 = new THREE.PointLight(0x00c8ff, 0.8, 200);
    p1.position.set(20, 30, 20);
    scene.add(p1);
    var p2 = new THREE.PointLight(0x7b68ee, 0.6, 200);
    p2.position.set(80, 25, 80);
    scene.add(p2);

    // ---------- 地面 ----------
    var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(300, 300),
        new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    var grid = new THREE.GridHelper(300, 60, 0x00c8ff, 0x123a66);
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
    grid.position.y = 0.2;
    scene.add(grid);

    // ---------- 楼栋 ----------
    var buildings = [];   // {id, mesh, x, z, h, label}
    var buildingMap = {}; // id -> building

    function makeWindowTexture(floors, cols, lit) {
        var c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#101a30';
        ctx.fillRect(0, 0, 256, 256);
        var fh = 256 / (floors || 16);
        var cw = 256 / (cols || 4);
        for (var f = 0; f < (floors || 16); f++) {
            for (var cc = 0; cc < (cols || 4); cc++) {
                var on = Math.random() < (lit || 0.55);
                ctx.fillStyle = on ? 'rgba(140, 220, 255, 0.85)' : 'rgba(20, 32, 60, 0.9)';
                ctx.fillRect(cc * cw + cw * 0.2, f * fh + fh * 0.18, cw * 0.6, fh * 0.55);
            }
        }
        var tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function floorCountOf(buildingId) {
        var maxF = 0;
        UNITS.forEach(function (u) {
            if (u.building === buildingId) {
                var n = parseInt(String(u.room).replace(/[^0-9]/g, ''), 10);
                var f = Math.floor(n / 100) || 1;
                if (f > maxF) maxF = f;
            }
        });
        return maxF || 16;
    }

    // 每层户数: 统计该楼栋最常见的同层房间号个数 (每户一窗, 窗户=真实房屋)
    function unitsPerFloorOf(buildingId) {
        var perFloor = {};
        UNITS.forEach(function (u) {
            if (u.building !== buildingId) return;
            var n = parseInt(String(u.room).replace(/[^0-9]/g, ''), 10);
            var floor = Math.floor(n / 100) || 1;
            if (!perFloor[floor]) perFloor[floor] = 0;
            perFloor[floor]++;
        });
        var counts = {};
        for (var f in perFloor) {
            var c = perFloor[f];
            counts[c] = (counts[c] || 0) + 1;
        }
        var best = 0, bestC = 0;
        for (var c2 in counts) if (counts[c2] > bestC) { bestC = counts[c2]; best = parseInt(c2, 10); }
        return best || 4;
    }

    function buildScene() {
        var src = HOTSPOTS.length ? HOTSPOTS : [];
        // 3D 布局: 按原坐标排序分 5 行 5 列网格化 (保证分散不重叠 + 保持上下/左右相对方位)
        var sorted = src.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
        var COLS = 5;
        sorted.forEach(function (b, idx) {
            var row = Math.floor(idx / COLS), col = idx % COLS;
            var x = 12 + col * 17;      // 12 ~ 80
            var z = 12 + row * 16.5;    // 12 ~ 78
            var w = 7 + (b.w || 5) * 0.35;          // 住宅 ~8.5, 商铺 ~8
            var d = (b.h || 7) * 0.8;               // 住宅长条 ~11-13.6, 商铺 ~3
            var floors = floorCountOf(b.id);
            var h = Math.max(6, floors * 3.1);
            var shop = !!b.shop;
            if (shop) { w = 7.5; d = 6; }

            var geo = new THREE.BoxGeometry(w, h, d);
            var cols = shop ? 4 : unitsPerFloorOf(b.id);   // 每层户数 = 窗户列数 (窗户对应真实房屋)
            var mat = new THREE.MeshStandardMaterial({
                map: makeWindowTexture(shop ? 2 : floors, cols, shop ? 0.85 : 0.55),
                emissive: new THREE.Color(0x0a2a4a),
                emissiveIntensity: 0.6,
                roughness: 0.55,
                metalness: 0.35,
            });
            var mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, h / 2, z);
            mesh.castShadow = true;
            scene.add(mesh);

            // 楼顶边缘发光框
            var edge = new THREE.LineSegments(
                new THREE.EdgesGeometry(geo),
                new THREE.LineBasicMaterial({ color: shop ? 0xffc860 : 0x00c8ff, transparent: true, opacity: 0.5 })
            );
            edge.position.copy(mesh.position);
            scene.add(edge);

            // 楼栋标签 Sprite
            var sc = document.createElement('canvas');
            sc.width = 256; sc.height = 96;
            var sctx = sc.getContext('2d');
            sctx.fillStyle = 'rgba(6, 14, 30, 0.82)';
            sctx.fillRect(0, 0, 256, 96);
            sctx.strokeStyle = shop ? '#ffc860' : '#00c8ff';
            sctx.lineWidth = 4;
            sctx.strokeRect(4, 4, 248, 88);
            sctx.fillStyle = shop ? '#ffd77a' : '#8fe0ff';
            sctx.font = 'bold 52px Microsoft YaHei, sans-serif';
            sctx.textAlign = 'center';
            sctx.textBaseline = 'middle';
            sctx.fillText(b.id, 128, 52);
            var spr = new THREE.Sprite(new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(sc), transparent: true, depthTest: false
            }));
            spr.scale.set(10, 3.8, 1);
            spr.position.set(x, h + 4.5, z);
            scene.add(spr);

            var bd = { id: b.id, mesh: mesh, x: x, z: z, h: h, shop: shop, label: spr };
            buildings.push(bd);
            buildingMap[b.id] = bd;
        });
        window.__buildings = buildings; // 调试/验证用
    }
    buildScene();

    // ---------- 无人机自动巡航 ----------
    var MODES = ['推拉', '盘旋', '环绕'];
    var modeIdx = 0;
    var cruiseT = 0;
    var MODE_DUR = 14;      // 每模式 14 秒
    var cruisePaused = 0;   // 用户交互后暂停计数
    var center = new THREE.Vector3(50, 8, 50);

    function cruise(dt) {
        if (cruisePaused > 0) { cruisePaused -= dt; return; }
        cruiseT += dt;
        var t = (cruiseT % MODE_DUR) / MODE_DUR;
        var a = t * Math.PI * 2;
        var pos = new THREE.Vector3();
        var look = center.clone();
        var mode = MODES[modeIdx];

        if (mode === '推拉') {
            // 径向推拉: 远 140 → 近 45
            var r = 45 + (1 - t) * 95;
            pos.set(center.x + r, 55, center.z + r * 0.55);
            look.set(center.x, 20, center.z);
        } else if (mode === '盘旋') {
            // 高空盘旋: 半径 110, 高度起伏
            var r2 = 110;
            pos.set(center.x + Math.cos(a) * r2, 60 + Math.sin(a * 0.5) * 18, center.z + Math.sin(a) * r2);
            look.set(center.x, 10, center.z);
        } else {
            // 环绕低空: 半径 60, 贴地环绕
            var r3 = 60;
            pos.set(center.x + Math.cos(a) * r3, 16 + Math.sin(a * 2) * 6, center.z + Math.sin(a) * r3);
            look.set(center.x, 12, center.z);
        }
        camera.position.lerp(pos, 1 - Math.pow(0.001, dt));
        controls.target.lerp(look, 1 - Math.pow(0.001, dt));
    }

    // ---------- 房号定位 ----------
    var locating = false;
    var targetCam = null, targetLook = null;

    function locateRoom() {
        var raw = document.getElementById('roomSearch').value.trim();
        if (!raw) return;
        // 支持两种输入: "1602" 或 "1-1602"
        var qRoom = raw, qB = null;
        if (raw.indexOf('-') > 0) { qB = raw.slice(0, raw.indexOf('-')); qRoom = raw.slice(raw.indexOf('-') + 1); }
        var u = null;
        for (var i = 0; i < UNITS.length; i++) {
            if (String(UNITS[i].room) === qRoom) {
                if (!qB || UNITS[i].building === qB || UNITS[i].building.replace('#', '') === qB) { u = UNITS[i]; break; }
            }
        }
        if (!u) {
            document.getElementById('modeTag').textContent = '未找到房号 ' + raw;
            return;
        }
        var bd = buildingMap[u.building];
        if (!bd) return;
        locating = true;
        cruisePaused = 60;
        var dist = Math.max(bd.h * 1.6, 16);
        targetCam = new THREE.Vector3(bd.x + dist, bd.h * 0.55, bd.z + dist * 0.7);
        targetLook = new THREE.Vector3(bd.x, bd.h * 0.35, bd.z);
        var roomLabel = u.building.replace('#', '') + '-' + u.room.replace(/^商/, '');
        document.getElementById('modeTag').textContent = '已定位: ' + roomLabel + ' (' + u.layout + ')';
        var det = document.getElementById('roomDetail');
        det.style.display = 'inline-flex';
        det.href = 'sales_control_v2.html?b=' + encodeURIComponent(u.building) + '&r=' + encodeURIComponent(u.room);
        det.textContent = '查看 ' + roomLabel + ' 详情 →';
    }

    document.getElementById('roomGo').addEventListener('click', locateRoom);
    document.getElementById('roomSearch').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') locateRoom();
    });

    // 用户拖拽/缩放 → 暂停巡航 8 秒
    controls.addEventListener('start', function () { cruisePaused = 8; });
    controls.addEventListener('change', function () { if (locating) { locating = false; } });

    // ---------- 模式切换 ----------
    function nextMode() {
        modeIdx = (modeIdx + 1) % MODES.length;
        document.getElementById('modeTag').textContent = '巡航模式: ' + MODES[modeIdx];
        cruiseT = 0;
    }
    document.getElementById('modeTag').addEventListener('click', nextMode);
    setInterval(function () {
        if (cruisePaused <= 0) { nextMode(); }
    }, MODE_DUR * 1000);

    // ---------- 渲染循环 ----------
    var lastT = performance.now();
    function animate(now) {
        requestAnimationFrame(animate);
        var dt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;

        if (locating && targetCam) {
            camera.position.lerp(targetCam, 1 - Math.pow(0.001, dt));
            controls.target.lerp(targetLook, 1 - Math.pow(0.001, dt));
            if (camera.position.distanceTo(targetCam) < 0.6) locating = false;
        } else if (cruisePaused <= 0) {
            cruise(dt);
        }
        controls.update();
        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);

    // ---------- 自适应 ----------
    function resize() {
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 50);

    // 暴露定位函数给 HTML onclick
    window.locateRoom = locateRoom;
})();
