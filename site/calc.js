(function () {
  var PETS = (window.PETS || []).slice();
  var SKILLS = (window.SKILLS || []).slice();
  var NATURES = (window.NATURES || []).slice();
  var TYPES = window.TYPES || {};
  var $ = function (id) { return document.getElementById(id); };
  var byName = function (n) { return PETS.filter(function (p) { return p.n === n; })[0] || null; };
  var byId = function (id) { return SKILLS.filter(function (s) { return s.id === Number(id); })[0] || null; };

  // 数据里没有的技能：允许手填威力/属性/分类（bwiki 也查不到的先占位）
  var CUSTOM_SEED = { "愿力冲击": { n: "愿力冲击", p: 80, e: "普通", t: "物攻", c: 3, wish: true } };

  function customOf(name) {
    return (state.custom && state.custom[name]) || CUSTOM_SEED[name] || null;
  }
  function skillByName(name) {
    var hit = SKILLS.filter(function (x) { return x.n === name; })[0];
    if (hit) return hit;
    var c = (state.custom && state.custom[name]) || null;
    var seed = CUSTOM_SEED[name] || null;
    if (!c) return seed;
    if (seed) {
      return Object.assign({}, seed, c, { p: c.p || seed.p, e: c.e || seed.e, t: c.t || seed.t, c: c.c || seed.c });
    }
    return c;
  }

  function natureFactor(nature, stat, stars) {
    if (!nature) return 1;
    if (nature.up === stat) return 1.1 + 0.02 * stars;
    if (nature.down === stat) return 0.9;
    return 1;
  }
  function computeStats(pet, o) {
    var L = +o.level || 60, SS = Number(o.stars);
    if (!Number.isFinite(SS)) SS = 5;
    var ivs = o.iv || {};
    function ik(key) {
      var v = Number(ivs[key]);
      return (Number.isFinite(v) ? v : 10) * (1 + SS);
    }
    function c(stat) { return natureFactor(o.nature, stat, SS); }
    function nonHp(S, stat, key) {
      return 10 * SS + Math.round(c(stat) * Math.round((0.01 * L + 0.5) * (S + 0.5 * ik(key)) + 10));
    }
    return {
      hp: 20 * SS + Math.round(c("生命") * Math.round((0.02 * L + 0.5) * (pet.hp + 0.5 * ik("hp")) + L + 10)),
      atk: nonHp(pet.atk, "物攻", "atk"), ma: nonHp(pet.ma, "魔攻", "ma"),
      def: nonHp(pet.def, "物防", "def"), md: nonHp(pet.md, "魔防", "md"),
      spe: nonHp(pet.spe, "速度", "spe")
    };
  }
  function typeMult(e, pet) {
    var chart = TYPES[e];
    if (!chart) return 1;
    var add = 0, half = 0;
    [pet.el, pet.el2].filter(Boolean).forEach(function (t) {
      if ((chart.strong || []).indexOf(t) >= 0) add += 1;
      if ((chart.resist || []).indexOf(t) >= 0) half += 1;
    });
    return (1 + add) * Math.pow(0.5, half);
  }
  function traitMult(pet, sk) {
    var d = pet.td || "", m;
    if ((m = /使用([\u4e00-\u9fa5])系技能后[^。]{0,24}?双攻\+(\d+)%/.exec(d))) return m[1] === sk.e ? 1 + Number(m[2]) / 100 : 1;
    if ((m = /双攻\+(\d+)%/.exec(d))) return 1 + Number(m[1]) / 100;
    if (sk.t === "物攻" && (m = /物攻\+(\d+)%/.exec(d))) return 1 + Number(m[1]) / 100;
    if (sk.t === "魔攻" && (m = /魔攻\+(\d+)%/.exec(d))) return 1 + Number(m[1]) / 100;
    return 1;
  }

  var DEFAULT_MOVES = {
    mine: ["岩脉崩毁", "持续高温", "一拳", "冰晶坠"],
    foe: ["电弧", "交叉闪电", "翼击", "暴风眼"]
  };

  var KEY = "luoke.calc.v2";
  var state = {
    mine: { st: { mark: 0, wind: 0, charge: 0, photo: 0, spike: 0, slow: 0, combo: 1, poison: 0, burn: 0 }, slots: PETS.slice(0, 6).map(function (p) { return p.n; }), active: 0, level: 60, star: 5, iv: { hp: 10, atk: 10, def: 10, ma: 10, md: 10, spe: 10 }, nature: "", hp: 400, energy: 5, mana: 4, priority: 0, status: "健康", moves: ["", "", "", ""] },
    foe: { st: { mark: 0, wind: 0, charge: 0, photo: 0, spike: 0, slow: 0, combo: 1, poison: 0, burn: 0 }, slots: PETS.slice(6, 12).map(function (p) { return p.n; }), active: 0, level: 60, star: 5, iv: { hp: 10, atk: 10, def: 10, ma: 10, md: 10, spe: 10 }, nature: "", hp: 300, energy: 5, mana: 4, priority: 0, status: "健康", moves: ["", "", "", ""] },
    coef: 1, seed: Math.floor(Math.random() * 1e9), weather: "", cut: 0, mark: 0, combo: 1, custom: {}, foeStatusSkill: false, roles: {}, history: [], uiAction: "attack"
  };
  function normalizeSave(saved) {
    if (!saved || typeof saved !== "object") return;
    ["mine", "foe"].forEach(function (side) {
      var base = state[side], got = saved[side] || {};
      var merged = Object.assign({}, base, got);
      if (!Array.isArray(merged.moves) || !merged.moves.length) merged.moves = DEFAULT_MOVES[side].slice();
      while (merged.moves.length < 4) merged.moves.push("");
      if (!merged.st || typeof merged.st !== "object") merged.st = base.st;
      if (typeof merged.iv === "number") {
        merged.iv = { hp: merged.iv, atk: merged.iv, def: merged.iv, ma: merged.iv, md: merged.iv, spe: merged.iv };
      }
      if (!Array.isArray(merged.slots) || !merged.slots.length) merged.slots = base.slots;
      state[side] = merged;
    });
    if (typeof saved.coef === "number") state.coef = saved.coef;
    if (saved.seed) state.seed = saved.seed;
    if (saved.custom && typeof saved.custom === "object") state.custom = saved.custom;
    if (Array.isArray(saved.history)) state.history = saved.history;
    if (saved.uiAction) state.uiAction = saved.uiAction;
  }

  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) normalizeSave(saved);
  } catch (e) {}

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  var sidePet = function (side) { return byName(state[side].slots[state[side].active]) || PETS[0]; };
  function sideStats(side) {
    var pet = sidePet(side), s = state[side];
    var nature = NATURES.filter(function (n) { return n.n === s.nature; })[0] || null;
    return { pet: pet, stats: computeStats(pet, { level: s.level, stars: s.star, iv: s.iv, nature: nature }) };
  }

  // 定位（三层）：状态位 / 联防位 / 收割位
  // 先看特性语义，再看种族值分布，最后看技能池倾向
  var ROLE = {
    info: { key: "info", label: "状态位", cls: "r-info", desc: "试探、压首轮能量、挂状态" },
    tank: { key: "tank", label: "联防位", cls: "r-tank", desc: "吃伤害、打断能量、保轮转" },
    sweep: { key: "sweep", label: "收割位", cls: "r-sweep", desc: "进斩杀线后收人头" }
  };
  var ROLE_CACHE = {};

  // 用全库分位数打分，避免“人人都像联防位”
  var RANK = null;
  function buildRanks() {
    var byAtk = PETS.map(function (x) { return Math.max(x.atk, x.ma); }).sort(function (a, b) { return a - b; });
    var byBulk = PETS.map(function (x) { return (x.hp * 1.2 + x.def + x.md) / 3; }).sort(function (a, b) { return a - b; });
    var bySpe = PETS.map(function (x) { return x.spe; }).sort(function (a, b) { return a - b; });
    function pct(arr, v) {
      var lo = 0, hi = arr.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
      return lo / arr.length;
    }
    return { atk: pct.bind(null, byAtk), bulk: pct.bind(null, byBulk), spe: pct.bind(null, bySpe) };
  }

  function roleOf(pet) {
    if (state.roles && state.roles[pet.n]) return state.roles[pet.n];
    if (ROLE_CACHE[pet.n]) return ROLE_CACHE[pet.n];
    if (!RANK) RANK = buildRanks();
    var t = (pet.t || "") + " " + (pet.td || "");
    var atk = Math.max(pet.atk, pet.ma);
    var bulk = (pet.hp * 1.2 + pet.def + pet.md) / 3;

    var rAtk = RANK.atk(atk), rBulk = RANK.bulk(bulk), rSpe = RANK.spe(pet.spe);
    var score = {
      info: 1.6 + (1 - rAtk) * 0.8,
      tank: rBulk * 3.2,
      sweep: rAtk * 2.4 + rSpe * 0.8
    };
    if (/中毒|灼烧|冻结|印记|削弱|干扰|控制|能耗\+|偷取|驱散|渗透|侵蚀|增益/.test(t)) score.info += 1.4;
    if (/减伤|承受|抵挡|护盾|守护|坚韧|回复|再生|治疗|吸血|力竭时/.test(t)) score.tank += 1.2;
    if (/击败|收割|斩杀|连击数\+|爆发|提速|先于敌方|迅捷|追击/.test(t)) score.sweep += 1.2;
    if (/应对/.test(t)) score.info += 0.5;

    var best = "info";
    if (score.tank > score[best]) best = "tank";
    if (score.sweep > score[best]) best = "sweep";
    if (best === "tank" && score.sweep >= score.tank - 0.25 && atk >= 120) best = "sweep";
    ROLE_CACHE[pet.n] = best;
    return best;
  }

  // 图例
  function renderRoleLegend() {
    var box = document.getElementById("roleLegend");
    var box2 = document.getElementById("roleLegendFoe");
    if (!box && !box2) return;
    var counts = { info: 0, tank: 0, sweep: 0 };
    PETS.forEach(function (x) { counts[roleOf(x)] += 1; });
    var html = Object.keys(ROLE).map(function (k) {
      return "<span class='legend " + ROLE[k].cls + "'><b>" + ROLE[k].label + "</b> " + ROLE[k].desc +
        "（全库 " + counts[k] + " 只）</span>";
    }).join("");
    if (box) box.innerHTML = html;
    if (box2) box2.innerHTML = html;
  }

  // 元素色
  function elColor(el) {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--el-" + el);
    return (v || "").trim() || "#999";
  }

  function renderSlots(side) {
    var box = $(side + "Slots");
    box.innerHTML = "";
    state[side].slots.forEach(function (name, i) {
      var pet = byName(name);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (i === state[side].active ? " on" : "");
      b.style.background = pet ? elColor(pet.el) + "22" : "#fff";
      var role = pet ? ROLE[roleOf(pet)] : null;
      if (pet) b.title = pet.n + "｜" + (pet.t || "") + "｜" + (role ? role.label + "：" + role.desc : "");
      b.innerHTML = (role ? "<em class='slot-role " + role.cls + "'>" + role.label + "</em>" : "") +
        "<span>" + (name || "空") + "</span>" + (pet ? "<i class='dot' style='background:" + elColor(pet.el) + "'></i>" : "");
      b.addEventListener("click", function (ev) {
        if (ev.target && ev.target.classList && ev.target.classList.contains("slot-role") && pet) {
          var order = ["info", "tank", "sweep"];
          var cur = roleOf(pet);
          state.roles = state.roles || {};
          state.roles[pet.n] = order[(order.indexOf(cur) + 1) % 3];
          save(); renderAll();
          return;
        }
        state[side].active = i; save(); renderAll();
      });
      box.appendChild(b);
    });
  }

  var STAT_ROWS = [
    { key: "hp", label: "生命", base: "hp" },
    { key: "atk", label: "物攻", base: "atk" },
    { key: "def", label: "物防", base: "def" },
    { key: "ma", label: "魔攻", base: "ma" },
    { key: "md", label: "魔防", base: "md" },
    { key: "spe", label: "速度", base: "spe" }
  ];

  function renderStats(side) {
    var st = sideStats(side).stats, s = state[side];
    var body = $(side + "Stats");
    if (!body) return;
    body.innerHTML = STAT_ROWS.map(function (r) {
      var base = sidePet(side)[r.base];
      var v = Number(s.iv[r.key]);
      if (!Number.isFinite(v)) v = 10;
      return "<tr><td>" + r.label + "</td><td class='base'>" + base + "</td>" +
        "<td colspan='3'><span class='ivcell'>" +
        "<button type='button' data-iv='" + side + ":" + r.key + ":-1'>−</button>" +
        "<input data-ivinput='" + side + ":" + r.key + "' type='number' min='0' max='10' value='" + v + "'>" +
        "<button type='button' data-iv='" + side + ":" + r.key + ":1'>+</button>" +
        "</span></td><td class='total'>" + st[r.key] + "</td></tr>";
    }).join("");
    var total = STAT_ROWS.reduce(function (n, r) { return n + (Number(s.iv[r.key]) || 0); }, 0);
    var tEl = $(side + "IvTotal");
    if (tEl) tEl.textContent = "个体合计 " + total + "/60";
  }

  function renderCard(side) {
    var pet = sidePet(side), s = state[side], st = sideStats(side);
    var head = $(side + "Card").querySelector(".card-head");
    head.style.setProperty("--head", elColor(pet.el));
    head.style.setProperty("--head2", elColor(pet.el2 || pet.el));
    var nameEl = $(side + "NameText") || $(side + "Name");
    if (nameEl) nameEl.textContent = pet.n;
    $(side + "Tags").innerHTML = "<span class='tag'>" + pet.el + "</span>" + (pet.el2 ? "<span class='tag'>" + pet.el2 + "</span>" : "");
    $(side + "Ele").textContent = pet.el + (pet.el2 ? " / " + pet.el2 : "") + "　·　" + ROLE[roleOf(pet)].label;
    $(side + "Blood").textContent = "—（数据未收录）";
    $(side + "HpNote").textContent = s.hp + " / " + st.stats.hp;
    var bar = $(side + "HpBar");
    if (bar) bar.style.width = Math.min(100, s.hp / st.stats.hp * 100) + "%";
  }

  function buildMoves(side) {
    var box = $(side + "Moves");
    box.innerHTML = "";
    state[side].moves.forEach(function (name, i) {
      var sk = name ? skillByName(name) : null;
      var isCustom = !!sk && !SKILLS.some(function (x) { return x.n === sk.n; });
      var row = document.createElement("div");
      row.className = "move-row" + (isCustom ? " custom" : "");
      row.innerHTML =
        "<i class='mdot' style='background:" + (sk && sk.e ? elColor(sk.e) : "#c9c3b6") + "'></i>" +
        "<div class='mname'><input list='skillList' placeholder='选择或搜索技能' value='" + (sk ? sk.n : "") + "'><button type='button' class='mclear' title='清空'>×</button></div>" +
        (isCustom
          ? "<input class='mpower edit' data-edit='" + side + ":" + i + ":p' value='" + (sk.p || "") + "' placeholder='威力'>" +
            "<input class='mtype edit' data-edit='" + side + ":" + i + ":e' value='" + (sk.e || "") + "' placeholder='属性'>" +
            "<input class='mcat edit' data-edit='" + side + ":" + i + ":t' value='" + (sk.t || "") + "' placeholder='分类'>" +
            "<span class='mtag on'>自定义</span>"
          : "<input class='mpower' readonly value='" + (sk && sk.p !== null ? sk.p : "—") + "'>" +
            "<input class='mtype' readonly value='" + (sk ? sk.e : "—") + "'>" +
            "<input class='mcat' readonly value='" + (sk ? sk.t : "—") + "'>" +
            "<span class='mtag" + (sk && sk.r ? " on" : "") + "'>" + (sk && sk.r ? "先手+" + sk.r : "耗能 " + (sk ? sk.c : "—")) + "</span>");
      box.appendChild(row);

      var input = row.querySelector(".mname input");
      input.addEventListener("change", function () {
        var name2 = input.value.trim();
        state[side].moves[i] = name2;
        if (name2 && !SKILLS.some(function (x) { return x.n === name2; }) && !(state.custom && state.custom[name2])) {
          state.custom = state.custom || {};
          var seed = CUSTOM_SEED[name2];
          state.custom[name2] = seed ? Object.assign({}, seed, { n: name2 }) : { n: name2, p: 0, e: "普通", t: "物攻", c: 3 };
        }
        save(); buildMoves(side); renderBattle();
      });
      row.querySelector(".mclear").addEventListener("click", function () {
        state[side].moves[i] = "";
        save(); buildMoves(side); renderBattle();
      });
      Array.prototype.forEach.call(row.querySelectorAll("[data-edit]"), function (el) {
        el.addEventListener("change", function () {
          var parts = el.getAttribute("data-edit").split(":");
          var key = parts[2];
          var nm = state[side].moves[i];
          if (!nm) return;
          state.custom = state.custom || {};
          state.custom[nm] = state.custom[nm] || { n: nm, p: 0, e: "普通", t: "物攻", c: 3 };
          state.custom[nm][key] = key === "p" ? Number(el.value) || 0 : el.value.trim();
          save(); buildMoves(side); renderBattle();
        });
      });
    });
  }

  function buildNatures() {
    ["mine", "foe"].forEach(function (side) {
      var sel = $(side + "Nature");
      sel.innerHTML = "";
      var o0 = document.createElement("option");
      o0.value = ""; o0.textContent = "无（不加不减）";
      sel.appendChild(o0);
      NATURES.forEach(function (n) {
        var o = document.createElement("option");
        o.value = n.n; o.textContent = n.n + "（" + n.up + "▲/" + n.down + "▼）";
        sel.appendChild(o);
      });
      sel.value = state[side].nature;
      sel.addEventListener("change", function () { state[side].nature = sel.value; save(); renderAll(); });
    });
  }

  function renderEnergy(side) {
    var box = $(side + "EnergyPips");
    if (!box) return;
    var v = Math.max(0, Math.min(10, Number(state[side].energy) || 0));
    var html = "";
    for (var i = 0; i < 10; i++) html += "<i class='" + (i < v ? "on" : "") + "'></i>";
    box.innerHTML = html;
  }

  function koBadge(pct, hits) {
    if (pct >= 100 || hits === 1) return "<span class='badge-ko one'>一击</span>";
    if (hits === 2) return "<span class='badge-ko two'>2 发</span>";
    return "<span class='badge-ko more'>" + hits + " 发</span>";
  }
  function barClass(pct) { return pct >= 100 ? "" : pct >= 50 ? "low" : "mid"; }

  // 单个招式的伤害（双方共用；含克制/特性/减伤/印记/蓄势/连击/系数/愿力）
  function hitDamage(side, sk, attacker, defender) {
    if (!sk || !sk.p) return 0;
    var st = state[side].st || {};
    var magic = sk.t === "魔攻";
    var wishHit = !!sk.wish && state.foeStatusSkill && side === "mine";
    return Math.round(sk.p * ((magic ? attacker.stats.ma : attacker.stats.atk) / (magic ? defender.stats.md : defender.stats.def))
      * typeMult(sk.e, defender.pet) * traitMult(attacker.pet, sk)
      * (1 - Math.min(90, Math.max(0, Number(state.cut) || 0)) / 100)
      * (1 + 0.1 * (Number(st.mark) || 0)) * (Number(st.charge) ? 1.3 : 1)
      * Math.max(1, Number(st.combo) || 1) * (Number(state.coef) || 0) * (wishHit ? 2.5 : 1));
  }

  function hitCards(side, attacker, defender, hpNow) {
    var out = "";
    state[side].moves.forEach(function (name) {
      var sk = name ? skillByName(name) : null;
      if (!sk || !sk.p) {
        out += "<div class='mcard'><div class='mcard-top'><span class='mcard-name'>" + (name || "空") + "</span>" +
          (name ? "<span class='mcard-val'>资料待补</span>" : "") + "</div><div class='mcard-bar'></div></div>";
        return;
      }
      var dmg = hitDamage(side, sk, attacker, defender);
      var pct = dmg / Math.max(1, defender.stats.hp) * 100;   // 占满血比例，稳定可比较
      var hits = Math.max(1, Math.ceil(hpNow / Math.max(1, dmg)));
      var wishNote = sk.wish ? "<div class='mcard-note'>" + (wishHitNow(side) ? "应对状态成功 ×2.5" : "基础 80；对手用状态技时 ×2.5") + " · 每场限 2 次</div>" : "";
      out += "<div class='mcard'>" +
        "<div class='mcard-top'><span class='mcard-name'>" + sk.n + "</span>" + koBadge(pct, hits) + "</div>" +
        "<div class='mcard-val' style='margin-top:4px'>" + dmg + "（满血 " + Math.round(pct) + "%）</div>" +
        "<div class='mcard-bar'><i class='" + barClass(pct) + "' style='width:" + Math.min(100, pct) + "%'></i></div>" +
        wishNote +
        (state.mine.energy < sk.c && side === "mine" ? "<div class='mcard-note'>能量不够，要聚能</div>" : "") +
        "</div>";
    });
    return out;
  }

  function wishHitNow(side) { return side === "mine" && state.foeStatusSkill; }

  function renderRail(id, side) {
    var box = $(id);
    if (!box) return;
    var html = "";
    for (var i = 0; i < 6; i++) {
      html += "<div class='" + (i === state[side].active ? "on " + (side === "foe" ? "def" : "") : "") + "'>" + (i + 1) + "</div>";
    }
    box.innerHTML = html;
  }

  // 策略库：按「时间段 × 定位」整理，名称固定，玩家只决定贴到哪个行为上
  var STRATS = [
    // 1 信息试探
    { id: "probe-low", phase: "probe", role: "info", prim: true, name: "低费混合试探", acts: ["attack"],
      desc: "交替用不同费用技能，观察回应以更新对手类型信念" },
    { id: "probe-sell", phase: "probe", role: "info", prim: false, name: "卖血换信息", acts: ["attack", "counter"],
      desc: "只换能改变下一段换人/压能量决策的信息" },
    { id: "probe-keep", phase: "probe", role: "info", prim: false, name: "保留能量余量", acts: ["attack", "charge"],
      desc: "不交高费，留住下一段的行动空间" },
    { id: "probe-hide", phase: "probe", role: "tank", prim: false, name: "不暴露联防轴", acts: ["attack", "counter"],
      desc: "先观察克制关系，不提前亮出联防位" },
    { id: "probe-switch", phase: "probe", role: "tank", prim: false, name: "换入止损", acts: ["switch"],
      desc: "首发被压穿就早换，不硬吃一轮" },
    { id: "probe-hold", phase: "probe", role: "sweep", prim: false, name: "藏入场条件", acts: ["charge", "switch"],
      desc: "保能量、不空能入场、不承担伤害任务" },

    // 2 能量压制
    { id: "press-drain", phase: "press", role: "info", prim: true, name: "压能量逼聚能", acts: ["attack"],
      desc: "低费/状态技压对手能量，配合地刺、打断" },
    { id: "press-signal", phase: "press", role: "info", prim: false, name: "传递“我知道你在聚能”", acts: ["attack", "counter"],
      desc: "让对手知道空过他这一轮是亏的" },
    { id: "press-trigger", phase: "press", role: "info", prim: false, name: "触发策略", acts: ["attack"],
      desc: "压到断档就转逼聚能，形成条件反射式压制" },
    { id: "press-tank", phase: "press", role: "tank", prim: true, name: "切入吃伤害", acts: ["switch"],
      desc: "在克制形成前切入，替核心挡这一轮" },
    { id: "press-break", phase: "press", role: "tank", prim: false, name: "打断能量循环", acts: ["attack", "counter"],
      desc: "把对手推向被迫聚能或被动换人" },
    { id: "press-save", phase: "press", role: "sweep", prim: false, name: "能量向 5–7 靠拢", acts: ["charge"],
      desc: "为兑现段留出 2–3 次击杀的储备" },

    // 3 发育破局
    { id: "build-pierce", phase: "build", role: "info", prim: false, name: "印记穿透联防", acts: ["attack"],
      desc: "让对手轮转从获益变成送回合差" },
    { id: "build-window", phase: "build", role: "info", prim: false, name: "创造安全入场", acts: ["attack", "switch"],
      desc: "为收割位铺一个不吃伤害的上场口" },
    { id: "build-bait", phase: "build", role: "info", prim: false, name: "诱骗聚能或换人", acts: ["attack"],
      desc: "用假压力诱发对手错误决策" },
    { id: "build-hold", phase: "build", role: "tank", prim: true, name: "维持联防轴", acts: ["counter", "switch"],
      desc: "不让己方核心被压穿" },
    { id: "build-open", phase: "build", role: "tank", prim: false, name: "一轮破局行动", acts: ["attack"],
      desc: "打穿对手联防，制造结构性缺口" },
    { id: "build-line", phase: "build", role: "sweep", prim: true, name: "确认斩杀线", acts: ["attack"],
      desc: "星陨 10 层、冻结 6–8 层这类可兑现的线" },
    { id: "build-cash", phase: "build", role: "sweep", prim: false, name: "提前兑现判断", acts: ["switch", "attack"],
      desc: "进线就兑现，不因发育未满而错过窗口" },

    // 4 兑现斩杀
    { id: "kill-sac", phase: "kill", role: "info", prim: false, name: "牺牲保先手", acts: ["counter", "attack"],
      desc: "用一只换收割位的出手顺序" },
    { id: "kill-cover", phase: "kill", role: "tank", prim: true, name: "先手联防夺回顺序", acts: ["counter", "switch"],
      desc: "后手不强行兑现，先用联防抢回顺序" },
    { id: "kill-exec", phase: "kill", role: "sweep", prim: true, name: "先手兑现", acts: ["attack"],
      desc: "每击先问：能不能在他反应前完成击杀" },
    { id: "kill-margin", phase: "kill", role: "sweep", prim: false, name: "斩杀留余量", acts: ["attack"],
      desc: "给伤害波动与残留血量留缓冲" },

    // 5 残局
    { id: "end-window", phase: "end", role: "info", prim: true, name: "制造错误聚能窗口", acts: ["attack", "counter"],
      desc: "残局里一次被先手打断的聚能等于送赛点" },
    { id: "end-hold", phase: "end", role: "tank", prim: false, name: "领先先消耗", acts: ["counter", "switch"],
      desc: "领先 1 点魔力值时，用联防消耗而不是对攻" },
    { id: "end-comeback", phase: "end", role: "tank", prim: false, name: "换人反杀", acts: ["switch"],
      desc: "落后时用换人先手权制造反杀窗口" },
    { id: "end-line", phase: "end", role: "sweep", prim: true, name: "拼速前定线", acts: ["attack", "charge"],
      desc: "把胜负推到确定线，别交给同速随机" }
  ];

  // 五个轮次时间段
  var PHASES = [
    { key: "probe", label: "信息试探", color: "#3f6fa8", from: 1, to: 4 },
    { key: "press", label: "能量压制", color: "#3f8f6a", from: 5, to: 10 },
    { key: "build", label: "发育破局", color: "#c99a3f", from: 11, to: 16 },
    { key: "kill", label: "兑现斩杀", color: "#c9503c", from: 17, to: 24 },
    { key: "end", label: "残局收束", color: "#6a4a9c", from: 25, to: 50 }
  ];

  // 分类：回合区间 + 魔力值 + 血量 + 能量
  function phaseOf(turn, c) {
    var byTurn = PHASES[PHASES.length - 1];
    for (var i = 0; i < PHASES.length; i++) {
      if (turn >= PHASES[i].from && turn <= PHASES[i].to) { byTurn = PHASES[i]; break; }
    }
    // 1) 后段且一方魔力告急 → 残局收束
    if (turn >= 17 && (c.myMana <= 1 || c.foeMana <= 1)) return PHASES[4];
    // 1.5) 对手被迫聚能且已过试探段 → 能量压制
    if (c.foeForced && turn >= 5) return PHASES[1];
    // 2) 对手进入斩杀线（血 ≤30% 或魔力 ≤1）→ 兑现斩杀
    if (c.foeHpPct <= 30 || c.foeMana <= 1) return PHASES[3];
    // 3) 中段出现能量断档 → 仍属能量压制
    if (byTurn.key === "build" && c.foeEnergy <= 2) return PHASES[1];
    return byTurn;
  }

  function renderTimeline() {
    var turn = state.history.length;
    var mine = sideStats("mine"), foe = sideStats("foe");
    var foePct = state.foe.hp / foe.stats.hp * 100;
    var myPct = state.mine.hp / mine.stats.hp * 100;
    var ph = phaseOf(Math.max(1, turn), {
      foeHpPct: foePct, myHpPct: myPct,
      foeMana: Number(state.foe.mana) || 0, myMana: Number(state.mine.mana) || 0,
      foeEnergy: Number(state.foe.energy) || 0, myEnergy: Number(state.mine.energy) || 0
    });
    var fill = $("tlFill");
    if (fill) {
      fill.style.width = Math.min(100, turn / 50 * 100) + "%";
      fill.style.background = ph.color;
    }
    var tag = $("phaseName");
    if (tag) { tag.textContent = "第 " + Math.max(1, turn) + " 回合 · " + ph.label; tag.style.background = ph.color; }

    var legend = $("tlLegend");
    if (legend) {
      legend.innerHTML = PHASES.map(function (p) {
        return "<span><i style='background:" + p.color + "'></i>" + p.label + " " + p.from + "–" + p.to + "</span>";
      }).join("");
    }

    var list = $("historyList");
    if (list) {
      list.innerHTML = state.history.slice(-6).reverse().map(function (h) {
        return "<div class='hrow'><span>第 " + h.turn + " 回合 · " + h.phase +
          (h.strat ? "　<span class='strat-chip'>" + h.strat + "</span>" : "") + "</span>" +
          "<b>我 " + h.mineHp + " / 敌 " + h.foeHp + " · 能量 " + h.mineEnergy + "/" + h.foeEnergy +
          " · 魔力 " + (h.mineMana === undefined ? "—" : h.mineMana) + "/" + (h.foeMana === undefined ? "—" : h.foeMana) +
          (h.switchedMe ? " · 我换" + h.switchedMe : "") +
          (h.switchedFoe ? " · 敌换" + h.switchedFoe : "") +
          (h.first ? " · " + (h.first === "me" ? "我先" : "敌先") : "") +
          (h.counterMe === true ? " · 我应对✓" : h.counterMe === false ? " · 我应对✗" : "") +
          (h.counterFoe === true ? " · 敌应对✓" : h.counterFoe === false ? " · 敌应对✗" : "") +
          (h.meAct ? " · 我" + ({ attack: "打", charge: "聚能", switch: "换", counter: "应对" }[h.meAct] || "") +
            " / 敌" + ({ attack: "打", charge: "聚能", switch: "换", counter: "应对" }[h.foeAct] || "") : "") + "</b></div>";
      }).join("") || "<div class='hrow'><span>还没有记录，点“记录本回合”开始。</span></div>";
    }

    var sel = $("restoreTurn");
    if (sel) {
      var cur = sel.value;
      sel.innerHTML = "<option value=''>还原到第几回合…</option>" + state.history.map(function (h) {
        return "<option value='" + h.turn + "'>第 " + h.turn + " 回合（" + h.phase + "）</option>";
      }).join("");
      sel.value = cur;
    }
  }

  function renderBattle() {
    var mine = sideStats("mine"), foe = sideStats("foe");
    $("duelMineName").textContent = mine.pet.n;
    $("duelFoeName").textContent = foe.pet.n;
    $("battleMoves").innerHTML = hitCards("mine", mine, foe, state.foe.hp);
    $("foeHits").innerHTML = hitCards("foe", foe, mine, state.mine.hp);
    renderRail("railMine", "mine");
    renderRail("railFoe", "foe");

    var eh = $("energyHint");
    if (eh) eh.textContent = "· 我方能量 " + state.mine.energy + "/10";
    $("p1Stat").innerHTML = mine.pet.n + "<br>HP " + state.mine.hp + " / " + mine.stats.hp +
      "<br>能量 " + state.mine.energy + "/10 · " + (state.mine.status || "健康");
    $("p2Stat").innerHTML = foe.pet.n + "<br>HP " + state.foe.hp + " / " + foe.stats.hp +
      "<br>能量 " + state.foe.energy + "/10 · " + (state.foe.status || "健康");
    renderTimeline();
    var tick = Math.round(foe.stats.hp * (0.03 * (Number(state.foe.st.poison) || 0) + 0.02 * (Number(state.foe.st.burn) || 0)));
    var tn = $("tickNote");
    if (tn) tn.textContent = tick > 0 ? "回合结束他会掉 " + tick + "（中毒 " + state.foe.st.poison + " 层 / 灼烧 " + state.foe.st.burn + " 层）" : "";
  }

  function fillStates() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-state]"), function (el) {
      var side = el.getAttribute("data-state"), key = el.getAttribute("data-key");
      var v = state[side].st[key];
      el.value = v === undefined ? (key === "combo" ? 1 : 0) : v;
    });
  }

  function renderAll() {
    ["mine", "foe"].forEach(function (side) {
      renderSlots(side); renderStats(side); renderCard(side); buildMoves(side);
      var s = state[side];
      $(side + "Level").value = s.level;
      $(side + "Star").value = s.star;
      $(side + "Hp").value = s.hp;
      $(side + "Energy").value = s.energy;
      if ($(side + "Mana")) $(side + "Mana").value = s.mana;
      if ($(side + "Priority")) $(side + "Priority").value = s.priority || 0;
      if ($(side + "Status")) $(side + "Status").value = s.status || "健康";
      renderEnergy(side);
      $(side + "Nature").value = s.nature || "";
    });
    fillStates();
    fillMoveSelects();
    if ($("meAction") && state.uiAction) $("meAction").value = state.uiAction;
    fillStrategies();
    renderBattle();
  }

  // 绑定输入
  ["mine", "foe"].forEach(function (side) {
    ["Level", "Star", "Hp", "Energy", "Mana", "Priority"].forEach(function (k) {
      var el = $(side + k);
      el.addEventListener("input", function () {
        var key = k.toLowerCase();
        state[side][key] = Number(el.value) || 0;
        save(); renderStats(side); renderCard(side); renderEnergy(side); renderBattle();
      });
    });
  });
  var help = document.createElement("div");
  help.className = "coef-help";
  help.innerHTML = "系数：公式结果 × 系数 = 实际伤害。先用一次实测伤害校准。";
  var coefBox = $("coef").parentElement;
  coefBox.appendChild(help);
  var cal = document.createElement("div");
  cal.className = "coef-cal";
  cal.innerHTML = "<input id='realDmg' type='number' placeholder='实测伤害' style='width:96px'>" +
    "<button type='button' id='calBtn'>校准</button><span id='calMsg'></span>";
  coefBox.appendChild(cal);
  $("calBtn").addEventListener("click", function () {
    var real = Number($("realDmg").value);
    var mine = sideStats("mine"), foe = sideStats("foe");
    var sk = byId(state.mine.moves[0]);
    if (!(real > 0) || !sk) { $("calMsg").textContent = "先选好第 1 个技能，再填实测伤害"; return; }
    var magic = sk.t === "魔攻";
    var base = sk.p * ((magic ? mine.stats.ma : mine.stats.atk) / (magic ? foe.stats.md : foe.stats.def))
      * typeMult(sk.e, foe.pet) * traitMult(mine.pet, sk);
    var k = real / base;
    state.coef = Math.round(k * 1000) / 1000;
    $("coef").value = state.coef;
    $("calMsg").textContent = "系数 " + state.coef;
    save(); renderBattle();
  });

  ["mine", "foe"].forEach(function (side) {
    var el = $(side + "Status");
    if (!el) return;
    el.addEventListener("change", function () { state[side].status = el.value; save(); renderBattle(); });
  });
  var fss = $("foeStatusSkill");
  if (fss) {
    fss.value = state.foeStatusSkill ? "1" : "";
    fss.addEventListener("change", function () {
      state.foeStatusSkill = fss.value === "1";
      save(); renderBattle();
    });
  }

  ["coef", "cut"].forEach(function (id) {
    $(id).value = state[id];
    $(id).addEventListener("input", function () { state[id] = Number($(id).value) || 0; save(); renderBattle(); });
  });
  $("weather").value = state.weather || "";
  $("weather").addEventListener("change", function () { state.weather = $("weather").value; save(); });

  document.addEventListener("input", function (e) {
    var side = e.target.getAttribute && e.target.getAttribute("data-state");
    if (!side) return;
    var key = e.target.getAttribute("data-key");
    var v = Math.max(0, Number(e.target.value) || 0);
    state[side].st[key] = v;
    save(); renderBattle();
  });

  // 同速平手：用「种子 + 回合数」决定，保证同一回合重放一致
  function tieFlip(turn) {
    var seed = Number(state.seed) || 1;
    var x = (seed ^ (turn * 2654435761)) >>> 0;
    x = (x ^ (x >>> 13)) * 1274126177 >>> 0;
    return (x >>> 31) === 0;
  }

  function advanceActive(side) {
    var s = state[side];
    if (!s.slots || !s.slots.length) return null;
    s.active = (s.active + 1) % s.slots.length;
    var st = sideStats(side);
    s.hp = st.stats.hp;
    return st.pet.n;
  }

  function recordTurn() {
    var mine = sideStats("mine"), foe = sideStats("foe");
    var before = {
      mineHp: state.mine.hp, foeHp: state.foe.hp,
      mineEnergy: state.mine.energy, foeEnergy: state.foe.energy,
      mineMana: state.mine.mana, foeMana: state.foe.mana
    };
    var meAct = ($("meAction") && $("meAction").value) || "attack";
    var foeAct = ($("foeActionRec") && $("foeActionRec").value) || "attack";
    var meMove = ($("meMoveSel") && $("meMoveSel").value) || "";
    var foeMove = ($("foeMoveSel") && $("foeMoveSel").value) || "";
    var koSide = ($("koSide") && $("koSide").value) || "";
    var foeForced = !!($("foeForced") && $("foeForced").value === "1");
    var stratId = ($("stratSel") && $("stratSel").value) || "";
    var strat = STRATS.filter(function (x) { return x.id === stratId; })[0] || null;

    var forcedMe = false, forcedFoe = false;
    var meSk = meMove ? skillByName(meMove) : null;
    var foeSk = foeMove ? skillByName(foeMove) : null;
    var dmgToFoe = 0, dmgToMe = 0;

    function isAttackSkill(x) { return !!x && (x.t === "物攻" || x.t === "魔攻"); }
    var counterWinMe = meAct === "counter" && meSk && foeSk && (
      (meSk.t === "防御" && isAttackSkill(foeSk)) ||
      (isAttackSkill(meSk) && foeSk.t === "状态") ||
      (meSk.t === "状态" && foeSk.t === "防御"));
    var counterWinFoe = foeAct === "counter" && foeSk && meSk && (
      (foeSk.t === "防御" && isAttackSkill(meSk)) ||
      (isAttackSkill(foeSk) && meSk.t === "状态") ||
      (foeSk.t === "状态" && meSk.t === "防御"));

    // 行动顺序：应对成功 > 换人 > 先手值（此处用速度）> 随机
    var meFirst;
    if (!!counterWinMe !== !!counterWinFoe) meFirst = !!counterWinMe;
    else if ((meAct === "switch") !== (foeAct === "switch")) meFirst = meAct === "switch";
    else if ((Number(state.mine.priority) || 0) !== (Number(state.foe.priority) || 0)) {
      meFirst = (Number(state.mine.priority) || 0) > (Number(state.foe.priority) || 0);
    } else if (mine.stats.spe !== foe.stats.spe) meFirst = mine.stats.spe > foe.stats.spe;
    else meFirst = tieFlip(state.history.length + 1);

    function meActs() {
      if (meAct === "switch") return;
      if (meAct === "charge") { state.mine.energy = Math.min(10, (Number(state.mine.energy) || 0) + 5); return; }
      if (meAct === "counter") {
        state.mine.energy = Math.max(0, (Number(state.mine.energy) || 0) - (meSk && meSk.c ? meSk.c : 3));
        return;
      }
      var cost = meSk && meSk.c ? meSk.c : 3;
      if ((Number(state.mine.energy) || 0) < cost) {
        meAct = "charge"; forcedMe = true;
        state.mine.energy = Math.min(10, (Number(state.mine.energy) || 0) + 5);
        return;
      }
      dmgToFoe = hitDamage("mine", meSk, mine, foe);
      if (counterWinFoe && foeSk && foeSk.t === "防御") dmgToFoe = Math.round(dmgToFoe * 0.3);
      state.mine.energy = Math.max(0, (Number(state.mine.energy) || 0) - cost);
      state.foe.hp = Math.max(0, state.foe.hp - dmgToFoe);
    }

    function foeActs() {
      if (foeAct === "switch") return;
      if (foeAct === "charge") { state.foe.energy = Math.min(10, (Number(state.foe.energy) || 0) + 5); return; }
      if (foeAct === "counter") {
        state.foe.energy = Math.max(0, (Number(state.foe.energy) || 0) - (foeSk && foeSk.c ? foeSk.c : 3));
        return;
      }
      var cost = foeSk && foeSk.c ? foeSk.c : 3;
      if ((Number(state.foe.energy) || 0) < cost) {
        foeAct = "charge"; forcedFoe = true;
        state.foe.energy = Math.min(10, (Number(state.foe.energy) || 0) + 5);
        return;
      }
      dmgToMe = hitDamage("foe", foeSk, foe, mine);
      if (counterWinMe && meSk && meSk.t === "防御") dmgToMe = Math.round(dmgToMe * 0.3);
      state.foe.energy = Math.max(0, (Number(state.foe.energy) || 0) - cost);
      state.mine.hp = Math.max(0, state.mine.hp - dmgToMe);
    }

    var switchedMe = null, switchedFoe = null;
    if (meAct === "switch") switchedMe = advanceActive("mine");
    if (foeAct === "switch") switchedFoe = advanceActive("foe");
    if (switchedMe || switchedFoe) { mine = sideStats("mine"); foe = sideStats("foe"); }

    if (meFirst) { meActs(); if (state.foe.hp > 0) foeActs(); }
    else { foeActs(); if (state.mine.hp > 0) meActs(); }

    // 倒下结算
    if (state.foe.hp <= 0 || koSide === "foe") {
      state.foe.mana = Math.max(0, (Number(state.foe.mana) || 0) - 1);
      state.foe.hp = foe.stats.hp;
    }
    if (state.mine.hp <= 0 || koSide === "mine") {
      state.mine.mana = Math.max(0, (Number(state.mine.mana) || 0) - 1);
      state.mine.hp = mine.stats.hp;
    }

    var turn = state.history.length + 1;
    var ph = phaseOf(turn, {
      foeHpPct: state.foe.hp / foe.stats.hp * 100, myHpPct: state.mine.hp / mine.stats.hp * 100,
      foeMana: Number(state.foe.mana) || 0, myMana: Number(state.mine.mana) || 0,
      foeEnergy: Number(state.foe.energy) || 0, myEnergy: Number(state.mine.energy) || 0,
      foeForced: foeForced
    });

    state.history.push({
      turn: turn, phase: ph.label, before: before,
      mineHp: state.mine.hp, foeHp: state.foe.hp,
      mineEnergy: state.mine.energy, foeEnergy: state.foe.energy,
      mineMana: state.mine.mana, foeMana: state.foe.mana,
      meAct: meAct, foeAct: foeAct, meMove: meMove, foeMove: foeMove,
      dmgToFoe: dmgToFoe, dmgToMe: dmgToMe,
      forcedMe: forcedMe, forcedFoe: forcedFoe,
      counterMe: meAct === "counter" ? counterWinMe : null,
      counterFoe: foeAct === "counter" ? counterWinFoe : null,
      switchedMe: switchedMe, switchedFoe: switchedFoe,
      strat: strat ? strat.name : "", stratRole: strat ? ROLE[strat.role].label : "",
      first: meFirst ? "me" : "foe"
    });
    if ($("koSide")) $("koSide").value = "";
    if ($("foeForced")) $("foeForced").value = "";
    save(); renderAll();
  }

  function exportJSON() {
    return JSON.stringify({
      app: "luoke-calc",
      version: 2,
      savedAt: new Date().toISOString(),
      mine: state.mine, foe: state.foe,
      coef: state.coef, seed: state.seed, custom: state.custom,
      history: state.history
    }, null, 2);
  }

  function downloadExport() {
    var blob = new Blob([exportJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
      "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
    var a = document.createElement("a");
    a.href = url;
    a.download = "luoke-match-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || data.app !== "luoke-calc") throw new Error("不是本工具导出的记录");
    state.mine = Object.assign(state.mine, data.mine || {});
    state.foe = Object.assign(state.foe, data.foe || {});
    if (typeof data.coef === "number") state.coef = data.coef;
    if (data.seed) state.seed = data.seed;
    if (data.custom) state.custom = data.custom;
    if (Array.isArray(data.history)) state.history = data.history;
    save(); renderAll();
  }

  window.luokeExport = exportJSON;
  window.luokeImport = importJSON;

  function fillStrategies() {
    var sel = $("stratSel");
    if (!sel) return;
    try { fillStrategiesInner(sel); } catch (e) { sel.innerHTML = "<option>ERR:" + e.message + "</option>"; }
  }

  function fillStrategiesInner(sel) {
    var mine = sideStats("mine"), foe = sideStats("foe");
    var ph = phaseOf(state.history.length + 1, {
      foeHpPct: state.foe.hp / foe.stats.hp * 100, myHpPct: state.mine.hp / mine.stats.hp * 100,
      foeMana: Number(state.foe.mana) || 0, myMana: Number(state.mine.mana) || 0,
      foeEnergy: Number(state.foe.energy) || 0, myEnergy: Number(state.mine.energy) || 0,
      foeForced: false
    });
    var act = ($("meAction") && $("meAction").value) || "attack";
    if (!$("meAction") || !$("meAction").value) state.uiAction = act;
    var role = roleOf(sidePet("mine"));
    var list = STRATS.filter(function (x) {
      return x.phase === ph.key && x.acts.indexOf(act) >= 0;
    });
    if (!list.length) {
      list = STRATS.filter(function (x) { return x.phase === ph.key; });
    }
    list.sort(function (a, b) {
      return (b.role === role) - (a.role === role) || (b.prim ? 1 : 0) - (a.prim ? 1 : 0);
    });
    var keep = sel.value;
    sel.innerHTML = "<option value=''>（不贴策略）</option>" + list.map(function (x) {
      var tag = ROLE[x.role].label + (x.prim ? "·主责" : "·辅责");
      return "<option value='" + x.id + "' data-desc='" + x.desc.replace(/'/g, " ") + "'>" + tag + "｜" + x.name + "</option>";
    }).join("");
    sel.value = list.some(function (x) { return x.id === keep; }) ? keep : "";

    var hint = $("stratHint");
    if (hint) {
      var cur = list.filter(function (x) { return x.id === sel.value; })[0];
      hint.textContent = cur ? cur.desc : "当前阶段（" + ph.label + "）可贴 " + list.length + " 条策略；不选也可以。";
    }
  }

  function fillMoveSelects() {
    [["meMoveSel", "mine"], ["foeMoveSel", "foe"]].forEach(function (pair) {
      var sel = $(pair[0]);
      if (!sel) return;
      var keep = sel.value;
      var names = state[pair[1]].moves.filter(Boolean);
      var html = "<option value=''>（不指定招式）</option>";
      if (names.length) {
        html += names.map(function (n) { return "<option value='" + n + "'>" + n + "</option>"; }).join("");
      } else {
        html += "<option value=''>（还没选招式 → 去“我方精灵/敌方精灵”页填写）</option>";
      }
      sel.innerHTML = html;
      sel.value = names.indexOf(keep) >= 0 ? keep : "";
    });
  }

  ["meAction", "stratSel"].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener("change", function () {
      if (id === "meAction") { state.uiAction = el.value; save(); }
      fillStrategies();
    });
  });

  if ($("recordTurn")) {
    $("recordTurn").addEventListener("click", recordTurn);
    $("undoTurn").addEventListener("click", function () {
      var h = state.history.pop();
      if (h && h.before) {
        state.mine.hp = h.before.mineHp; state.foe.hp = h.before.foeHp;
        state.mine.energy = h.before.mineEnergy; state.foe.energy = h.before.foeEnergy;
        state.mine.mana = h.before.mineMana; state.foe.mana = h.before.foeMana;
      }
      save(); renderAll();
    });
    $("clearTurns").addEventListener("click", function () {
      state.history = []; save(); renderBattle();
    });
    $("restoreTurn").addEventListener("change", function () {
      var t = Number(this.value);
      if (!t) return;
      var h = state.history.filter(function (x) { return x.turn === t; })[0];
      if (!h) return;
      state.mine.hp = h.mineHp; state.foe.hp = h.foeHp;
      state.mine.energy = h.mineEnergy; state.foe.energy = h.foeEnergy;
      if (h.mineMana !== undefined) state.mine.mana = h.mineMana;
      if (h.foeMana !== undefined) state.foe.mana = h.foeMana;
      state.history = state.history.slice(0, t);
      this.value = "";
      save(); renderAll();
    });
  }

  if ($("exportBtn")) {
    $("exportBtn").addEventListener("click", downloadExport);
    $("importFile").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { importJSON(String(reader.result)); }
        catch (e) { alert("导入失败：" + e.message); }
      };
      reader.readAsText(f);
      this.value = "";
    });
  }

  var pickingSide = null;
  function openPicker(side) {
    pickingSide = side;
    $("picker").hidden = false;
    $("pickerSearch").value = "";
    renderPicker("");
    setTimeout(function () { $("pickerSearch").focus(); }, 50);
  }
  function closePicker() { pickingSide = null; $("picker").hidden = true; }
  function renderPicker(q) {
    var list = PETS.filter(function (x) { return !q || x.n.indexOf(q) >= 0; });
    $("pickerList").innerHTML = list.map(function (x) {
      return "<button type='button' class='picker-item' data-pick='" + x.n + "'>" + x.n +
        "<span style='color:#8b8578;font-size:11px'> · " + x.el + "</span></button>";
    }).join("") || "<div style='color:#8b8578;font-size:13px'>没有匹配的精灵</div>";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".change-btn") : null;
    if (btn) { openPicker(btn.getAttribute("data-side")); return; }
    var item = e.target.closest ? e.target.closest("[data-pick]") : null;
    if (item && pickingSide) {
      var name = item.getAttribute("data-pick");
      state[pickingSide].slots[state[pickingSide].active] = name;
      var st = sideStats(pickingSide);
      state[pickingSide].hp = st.stats.hp;
      save(); closePicker(); renderAll();
      return;
    }
  });
  $("pickerClose").addEventListener("click", closePicker);
  $("picker").addEventListener("click", function (e) { if (e.target === $("picker")) closePicker(); });
  $("pickerSearch").addEventListener("input", function () { renderPicker(this.value.trim()); });

  // 标签切换
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (tab) {
    tab.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.classList.remove("on"); });
      Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) { v.classList.remove("on"); });
      tab.classList.add("on");
      $("view-" + tab.getAttribute("data-view")).classList.add("on");
      renderAll();
    });
  });

  // 技能候选
  var dl = document.createElement("datalist");
  dl.id = "skillList";
  SKILLS.forEach(function (sk) {
    var o = document.createElement("option");
    o.value = sk.n;
    dl.appendChild(o);
  });
  Object.keys(CUSTOM_SEED).forEach(function (n) {
    if (SKILLS.some(function (x) { return x.n === n; })) return;
    var o = document.createElement("option");
    o.value = n;
    dl.appendChild(o);
  });
  document.body.appendChild(dl);

  ["mine", "foe"].forEach(function (side) {
    var m = state[side].moves || [];
    if (!m.some(Boolean)) state[side].moves = DEFAULT_MOVES[side].slice();
  });

  buildNatures();
  renderRoleLegend();
  renderAll();
})();
