/* ===== 楼盘 3D 实景巡航 (Toobey) =====
 * Three.js 无人机视角: 推拉/盘旋/环绕 自动巡航 + 房号定位 + 详情跳转
 */
(function () {
    if (typeof THREE === 'undefined') return;

    var canvas = document.getElementById('view3d');
    if (!canvas) return;

    var UNITS = window.UNITS || [];
    var HOTSPOTS = window.BUILDINGS_HOTSPOTS || [];

    // 楼栋显示名映射（数据值 → 展示名）
    function bname(b) {
        var m = { 'S3商铺#': 'S3', 'S4商铺#': 'S4', '13商铺#': '13商', '18商铺#': '18商', '19商铺#': '19商', '20商铺#': '20商' };
        return m[b] || String(b).replace('#', '');
    }

    // 楼盘 3D 宣传大片提示词（仅用于生成 3D 效果图，页面不展示）
    var PROMPT_3D = 'Ultra-photorealistic 3D architectural visualization of TIANHE NO.1 (天河·壹号), an exclusive low-density luxury estate by Tubey International: master-planned site with 25 buildings precisely laid out per the official site plan — five rows of mid-rise residential towers (each tower 11-20 floors, 2-5 units per floor, 168㎡-288㎡ layouts: 乐山/乐水/拾雅/云庭/观云) arranged in a symmetric garden grid with tree-lined boulevards between rows, surrounded by a perimeter ring road; every tower facade shows its exact unit count per floor as glowing window grids — each window corresponds to a real sellable unit (e.g. unit 1602 on the 16th floor of Tower 1, unit 101/201 on the ground level of shop S2), ground-floor boutique shops with golden signage along the south street; central landscaped courtyard with fountain and reflecting pool, children\'s playground, sunken plaza, waterscape walkway; camera: cinematic drone flythrough at golden hour — dolly through the grand entrance gate, low-level glide along the boulevard revealing each tower\'s facade window grids, orbit the central fountain at 45-degree elevation, then ascend to a 270-degree panoramic reveal over the rooftops; volumetric god rays, subtle lens flare, gentle haze, 8K architectural photography, no text, no watermark, masterpiece quality';
    window.__PROMPT_3D = PROMPT_3D;

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
        // 布局: 使用作者总平图坐标 (buildings_hotspots 的 x/y/w/h 对应总平图真实位置),
        // 线性拉伸到整个场景分散开, 楼栋尺寸保持小比例避免互相覆盖
        var xs = src.map(function (b) { return b.x; });
        var ys = src.map(function (b) { return b.y; });
        var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        var spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
        function mapX(v) { return 12 + (v - minX) / spanX * 76; }  // 12 ~ 88
        function mapY(v) { return 12 + (v - minY) / spanY * 74; }  // 12 ~ 86
        src.forEach(function (b) {
            var x = mapX(b.x + (b.w || 5) / 2);
            var z = mapY(b.y + (b.h || 7) / 2);
            var w = Math.max(4.5, (b.w || 5) * 1.15);   // 保持总平图上的楼栋宽比例
            var d = Math.max(4.5, (b.h || 7) * 0.5);    // 长条高度转为进深, 半系数防重叠
            var floors = floorCountOf(b.id);
            var h = Math.max(6, floors * 3.1);
            var shop = !!b.shop;
            if (shop) { w = Math.max(5, w); d = 4.5; }

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
            sctx.fillText(bname(b.id), 128, 52);
            var spr = new THREE.Sprite(new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(sc), transparent: true, depthTest: false
            }));
            spr.scale.set(10, 3.8, 1);
            spr.position.set(x, h + 4.5, z);
            scene.add(spr);

            var bd = { id: b.id, mesh: mesh, x: x, z: z, w: w, d: d, h: h, shop: shop, label: spr };
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

    // ---------- 下拉菜单检索 + 房号定位 ----------
    var locating = false;
    var targetCam = null, targetLook = null;
    var selB = null, selR = null;        // 当前选中的 楼栋(数据名)/房号
    var hlMarker = null;                 // 目标户窗户高亮标记

    // 填充楼栋下拉（按楼栋号排序）
    function fillBuildings() {
        var list = document.getElementById('bdList');
        var sorted = HOTSPOTS.slice().sort(function (a, b) {
            var na = parseInt(String(a.id).replace(/[^0-9]/g, ''), 10) || 999;
            var nb = parseInt(String(b.id).replace(/[^0-9]/g, ''), 10) || 999;
            return na - nb;
        });
        list.innerHTML = sorted.map(function (b) {
            var shop = !!b.shop;
            return '<div class="dd-item' + (shop ? ' shop-dd' : '') + '" data-b="' + b.id + '" onclick="pickBuilding(this)">' + bname(b.id) + '</div>';
        }).join('');
    }

    // HOTSPOTS id → UNITS building 兼容匹配（如 S3# ↔ S3商铺#）
    function resolveBuilding(bid) {
        var hit = null;
        UNITS.forEach(function (u) { if (u.building === bid) hit = bid; });
        if (hit) return bid;
        var alt = bid.replace('#', '商铺#');   // S3# → S3商铺#
        var hit2 = null;
        UNITS.forEach(function (u) { if (u.building === alt) hit2 = alt; });
        if (hit2) return hit2;
        return bid;
    }

    // 选择楼栋 → 填充房号 + 镜头飞向楼栋
    function pickBuilding(el) {
        selB = el.dataset.b;
        selR = null;
        document.getElementById('bdBtn').textContent = bname(selB) + ' ▾';
        var rmBtn = document.getElementById('rmBtn');
        rmBtn.disabled = false;
        rmBtn.textContent = '房号 ▾';
        closeDD();
        hideDetail();
        // 房号列表（按楼层/户号排序）
        var rb = resolveBuilding(selB);
        var rooms = UNITS.filter(function (u) { return u.building === rb; })
            .sort(function (a, b) { return String(a.room).localeCompare(String(b.room), 'zh'); });
        document.getElementById('rmList').innerHTML = rooms.map(function (u) {
            return '<div class="dd-item" data-r="' + u.room + '" onclick="pickRoom(this)">' + u.room.replace(/^商/, '') + '</div>';
        }).join('');
        flyToBuilding(selB);
        document.getElementById('modeTag').textContent = '已选楼栋: ' + bname(selB) + '（' + rooms.length + ' 套）';
    }

    // 选择房号 → 定位到该户（镜头对准楼层 + 窗户高亮）
    function pickRoom(el) {
        selR = el.dataset.r;
        document.getElementById('rmBtn').textContent = selR.replace(/^商/, '') + ' ▾';
        closeDD();
        locateRoom(selB, selR);
    }

    // 镜头飞向整栋楼
    function flyToBuilding(bid) {
        var bd = buildingMap[bid];
        if (!bd) return;
        locating = true; cruisePaused = 60;
        var dist = Math.max(bd.h * 1.9, 20);
        targetCam = new THREE.Vector3(bd.x + dist, bd.h * 0.5, bd.z + dist * 0.7);
        targetLook = new THREE.Vector3(bd.x, bd.h * 0.3, bd.z);
    }

    // 该户在其楼层内的序号（决定窗户列）
    function unitIndexInFloor(u) {
        // 商铺复式房号 "101/201" 取第一段 (101 → 1层)
        var first = String(u.room).split('/')[0];
        var n = parseInt(first.replace(/[^0-9]/g, ''), 10) || 0;
        var floor = Math.floor(n / 100) || 1;
        var same = UNITS.filter(function (x) {
            if (x.building !== u.building) return false;
            var xf = String(x.room).split('/')[0];
            var xn = parseInt(xf.replace(/[^0-9]/g, ''), 10) || 0;
            return (Math.floor(xn / 100) || 1) === floor;
        }).sort(function (a, b) { return String(a.room).localeCompare(String(b.room), 'zh'); });
        for (var i = 0; i < same.length; i++) if (same[i].room === u.room) return i;
        return 0;
    }

    // 目标户窗户高亮标记（闪光星光形象）
    function makeStarTexture() {
        var c = document.createElement('canvas');
        c.width = 160; c.height = 160;
        var ctx = c.getContext('2d');
        var cx = 80, cy = 80, R = 66, r = 26;
        ctx.beginPath();
        for (var i = 0; i < 10; i++) {
            var rad = i % 2 === 0 ? R : r;
            var ang = -Math.PI / 2 + i * Math.PI / 5;
            var x = cx + rad * Math.cos(ang);
            var y = cy + rad * Math.sin(ang);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        var g = ctx.createRadialGradient(cx, cy, 4, cx, cy, R);
        g.addColorStop(0, '#fffdf0');
        g.addColorStop(0.35, '#ffe9a8');
        g.addColorStop(0.7, 'rgba(255, 196, 60, 0.85)');
        g.addColorStop(1, 'rgba(255, 180, 40, 0)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 240, 190, 0.95)';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // 中心亮点
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        return new THREE.CanvasTexture(c);
    }
    function showHlMarker(x, y, z) {
        if (!hlMarker) {
            hlMarker = new THREE.Sprite(new THREE.SpriteMaterial({
                map: makeStarTexture(), transparent: true, depthTest: false, blending: THREE.AdditiveBlending
            }));
            scene.add(hlMarker);
        }
        hlMarker.position.set(x, y, z);
        hlMarker.scale.set(4.2, 4.2, 1);
        hlMarker.material.opacity = 1;
        hlMarker.visible = true;
        window.__hlMarker = { x: x, y: y, z: z }; // 调试/验证用
    }

    // 定位到具体房号
    function locateRoom(bid, room) {
        var rb = resolveBuilding(bid);
        var u = null;
        for (var i = 0; i < UNITS.length; i++) {
            if (UNITS[i].building === rb && String(UNITS[i].room) === room) { u = UNITS[i]; break; }
        }
        if (!u) { document.getElementById('modeTag').textContent = '未找到该房号'; return; }
        // buildingMap 以 HOTSPOTS id 建图(S3#), UNITS building 可能是 S3商铺# → 优先用传入的 bid
        var bd = buildingMap[bid] || buildingMap[u.building];
        if (!bd) return;
        locating = true; cruisePaused = 60;
        // 目标户窗户 3D 位置
        var first = String(u.room).split('/')[0];   // 商铺复式房号 "101/201" 取第一段
        var n = parseInt(first.replace(/[^0-9]/g, ''), 10) || 0;
        var floor = Math.floor(n / 100) || 1;
        var unitIdx = unitIndexInFloor(u);
        var cols = Math.max(1, unitsPerFloorOf(bd.id));
        var winX = bd.x - bd.w / 2 + (unitIdx + 0.5) * (bd.w / cols);
        var winY = (floor - 1) * 3.1 + 1.7;
        var winZ = bd.z + bd.d / 2 + 0.2;
        showHlMarker(winX, winY, winZ);
        var dist = Math.max(bd.h * 0.85, 13);
        targetCam = new THREE.Vector3(winX + dist, winY + dist * 0.45, winZ + dist * 0.55);
        targetLook = new THREE.Vector3(winX, winY, winZ);
        var roomLabel = bname(u.building) + '-' + u.room.replace(/^商/, '');
        document.getElementById('modeTag').textContent = '已定位: ' + roomLabel + ' (' + u.layout + ')';
        var det = document.getElementById('roomDetail');
        det.style.display = 'inline-flex';
        det.href = 'sales_control_v2.html?b=' + encodeURIComponent(u.building) + '&r=' + encodeURIComponent(u.room);
        det.textContent = '查看 ' + roomLabel + ' 详情 →';
    }

    function hideDetail() { document.getElementById('roomDetail').style.display = 'none'; }

    // 下拉开关 / 关闭
    function toggleDD(which) {
        var list = document.getElementById(which === 'bd' ? 'bdList' : 'rmList');
        document.querySelectorAll('.dd-list').forEach(function (l) { if (l !== list) l.classList.remove('open'); });
        list.classList.toggle('open');
    }
    function closeDD() { document.querySelectorAll('.dd-list').forEach(function (l) { l.classList.remove('open'); }); }
    document.addEventListener('click', function (e) { if (!e.target.closest('.dd')) closeDD(); });

    document.getElementById('roomGo').addEventListener('click', function () {
        if (selB && selR) locateRoom(selB, selR);
        else if (selB) flyToBuilding(selB);
    });

    window.pickBuilding = pickBuilding;
    window.pickRoom = pickRoom;
    window.toggleDD = toggleDD;
    fillBuildings();

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
        // 目标户星光标记: 旋转 + 闪烁
        if (hlMarker && hlMarker.visible) {
            var pulse = Math.sin(now * 0.007);
            var sBase = 4.2 * (1 + pulse * 0.22);
            hlMarker.scale.set(sBase, sBase, 1);
            hlMarker.material.opacity = 0.6 + Math.sin(now * 0.009) * 0.35;
            hlMarker.material.rotation = now * 0.0012;
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
