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
        // 竖长画布匹配楼面比例, 每户一格: 窗框+玻璃, 墙体+隔墙线+楼层线 (真实感小方格)
        var W = 256, H = 1024;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        var rows = (floors || 16), cw = W / (cols || 4), ch = H / rows;
        // 墙体
        ctx.fillStyle = '#161e34';
        ctx.fillRect(0, 0, W, H);
        for (var f = 0; f < rows; f++) {
            for (var cc = 0; cc < (cols || 4); cc++) {
                var x = cc * cw, y = f * ch;
                // 每户玻璃窗 (随机亮灯)
                var on = Math.random() < (lit || 0.55);
                var wx = x + cw * 0.14, ww = cw * 0.72;
                var wy = y + ch * 0.18, wh = ch * 0.62;
                ctx.fillStyle = on ? 'rgba(160, 228, 255, 0.92)' : 'rgba(22, 34, 60, 0.98)';
                ctx.fillRect(wx, wy, ww, wh);
                // 窗框
                ctx.strokeStyle = 'rgba(10, 16, 30, 0.85)';
                ctx.lineWidth = 3;
                ctx.strokeRect(wx, wy, ww, wh);
                // 窗格中竖线 (双扇窗)
                ctx.beginPath();
                ctx.moveTo(wx + ww / 2, wy);
                ctx.lineTo(wx + ww / 2, wy + wh);
                ctx.stroke();
                // 窗台中横线
                ctx.beginPath();
                ctx.moveTo(wx, wy + wh * 0.5);
                ctx.lineTo(wx + ww, wy + wh * 0.5);
                ctx.stroke();
                // 户间墙缝
                ctx.strokeStyle = 'rgba(10, 16, 30, 0.9)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(x + cw, y);
                ctx.lineTo(x + cw, y + ch);
                ctx.stroke();
            }
            // 楼层分隔线 (楼板)
            ctx.strokeStyle = 'rgba(8, 12, 24, 0.95)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(0, (f + 1) * ch);
            ctx.lineTo(W, (f + 1) * ch);
            ctx.stroke();
        }
        var tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function floorCountOf(buildingId) {
        var maxF = 0;
        UNITS.forEach(function (u) {
            if (u.building === buildingId) {
                // 商铺复式房号 "101/201" 取第一段; 房号规则: 左起前两位=楼层, 最右=户位
                var first = String(u.room).split('/')[0];
                var n = parseInt(first.replace(/[^0-9]/g, ''), 10) || 0;
                var f = Math.floor(n / 100) || 1;
                if (f > maxF) maxF = f;
            }
        });
        return maxF || 16;
    }

    // 每层户数: 按编号规则(最右数字=户位)统计每层不同户位个数, 取最常见值 (每户一窗)
    function unitsPerFloorOf(buildingId) {
        var perFloor = {};
        UNITS.forEach(function (u) {
            if (u.building !== buildingId) return;
            var first = String(u.room).split('/')[0];
            var n = parseInt(first.replace(/[^0-9]/g, ''), 10) || 0;
            var floor = Math.floor(n / 100) || 1;
            var unit = n % 10;                    // 户位 = 最右数字
            if (!perFloor[floor]) perFloor[floor] = {};
            perFloor[floor][unit] = true;
        });
        var counts = {};
        for (var f in perFloor) {
            var c = Object.keys(perFloor[f]).length;
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
            var shop = !!b.shop;
            if (shop) return;   // 商铺楼栋 (S2/S3/S4/13商/18商/19商/20商) 3D 不展示
            var x = mapX(b.x + (b.w || 5) / 2);
            var z = mapY(b.y + (b.h || 7) / 2);
            var w = Math.max(4.5, (b.w || 5) * 1.15);   // 保持总平图上的楼栋宽比例
            var d = Math.max(4.5, (b.h || 7) * 0.5);    // 长条高度转为进深, 半系数防重叠
            var floors = floorCountOf(b.id);
            var h = Math.max(6, floors * 3.1);

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
                map: new THREE.CanvasTexture(sc), transparent: true, depthTest: true, depthWrite: false
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

    // 填充楼栋下拉（按楼栋号排序, 商铺楼栋不展示）
    function fillBuildings() {
        var list = document.getElementById('bdList');
        var sorted = HOTSPOTS.filter(function (b) { return !b.shop; }).slice().sort(function (a, b) {
            var na = parseInt(String(a.id).replace(/[^0-9]/g, ''), 10) || 999;
            var nb = parseInt(String(b.id).replace(/[^0-9]/g, ''), 10) || 999;
            return na - nb;
        });
        list.innerHTML = sorted.map(function (b) {
            return '<div class="dd-item" data-b="' + b.id + '" onclick="pickBuilding(this)">' + bname(b.id) + '</div>';
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

    // 选择楼栋 → 填充房号 (巡航保持转动, 不打断)
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
        document.getElementById('modeTag').textContent = '已选楼栋: ' + bname(selB) + '（' + rooms.length + ' 套）';
    }

    // 选择房号 → 仅记录 (巡航保持转动, 点击定位按钮后执行镜头路线)
    function pickRoom(el) {
        selR = el.dataset.r;
        document.getElementById('rmBtn').textContent = selR.replace(/^商/, '') + ' ▾';
        closeDD();
        document.getElementById('modeTag').textContent = '已选: ' + bname(selB) + '-' + selR.replace(/^商/, '') + '（点击 🎯 定位）';
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

    // 该户窗户列 (编号规则: 最右数字=户位, 户位-1 = 列)
    function unitIndexInFloor(u) {
        var first = String(u.room).split('/')[0];
        var n = parseInt(first.replace(/[^0-9]/g, ''), 10) || 0;
        return Math.max(0, (n % 10) - 1);
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

    // 镜头路线: 当前相机位置 → 贝塞尔弧线 → 目标户正前方近距
    var camAnim = null;
    function startCamRoute(endPos, lookPos) {
        var p0 = camera.position.clone();
        var mid = new THREE.Vector3(
            (p0.x + endPos.x) / 2,
            Math.max(p0.y, endPos.y) + Math.max(5, Math.abs(p0.y - endPos.y) * 0.25),
            (p0.z + endPos.z) / 2
        );
        camAnim = { p0: p0, mid: mid, p1: endPos, look: lookPos, t: 0, dur: 2.2 };
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
        locating = true; cruisePaused = 7;   // 镜头路线期间暂停巡航, 结束后恢复转动
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
        // 镜头路线: 从当前巡航位置弧线拉进到该户窗户正前方很近处
        startCamRoute(new THREE.Vector3(winX, winY + 0.4, winZ + 6.2), new THREE.Vector3(winX, winY, winZ));
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
        else document.getElementById('modeTag').textContent = '请先选择楼栋与房号';
    });

    window.pickBuilding = pickBuilding;
    window.pickRoom = pickRoom;
    window.toggleDD = toggleDD;
    window.__scene = scene;   // 调试/验证用
    fillBuildings();

    // 用户拖拽/缩放 → 打断镜头路线, 暂停巡航 8 秒
    controls.addEventListener('start', function () { camAnim = null; locating = false; cruisePaused = 8; });

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

        // 镜头路线 (贝塞尔): 巡航位 → 弧线 → 目标户正前方
        if (camAnim) {
            camAnim.t += dt / camAnim.dur;
            var done = camAnim.t >= 1;
            var t = done ? 1 : camAnim.t, u = 1 - t;
            camera.position.set(
                u * u * camAnim.p0.x + 2 * u * t * camAnim.mid.x + t * t * camAnim.p1.x,
                u * u * camAnim.p0.y + 2 * u * t * camAnim.mid.y + t * t * camAnim.p1.y,
                u * u * camAnim.p0.z + 2 * u * t * camAnim.mid.z + t * t * camAnim.p1.z
            );
            controls.target.lerp(camAnim.look, 0.12);
            if (done) { camAnim = null; locating = false; }
        } else if (cruisePaused <= 0) {
            cruise(dt);
        }
        // 目标户星光标记: 旋转 + 闪烁, 屏幕恒定大小 (近大远不小)
        if (hlMarker && hlMarker.visible) {
            var dist = camera.position.distanceTo(hlMarker.position);
            var sBase = Math.max(1.6, dist * 0.14) * (1 + Math.sin(now * 0.007) * 0.22);
            hlMarker.scale.set(sBase, sBase, 1);
            hlMarker.material.opacity = 0.6 + Math.sin(now * 0.009) * 0.35;
            hlMarker.material.rotation = now * 0.0012;
        }
        controls.update();
        renderer.render(scene, camera);
        window.__camPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }; // 调试
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
