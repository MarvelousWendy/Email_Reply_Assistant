/* ============================================================
   邮件回复决策助手 · 交互逻辑  app.js
   ============================================================
   数据来源：js/data.js（由 tools/build-data.py 从《长表结构.md》生成）
   语言支持：中文（zh） / English（en）—— 意大利语版本已彻底移除

   页面分三种视图：
     1. 选择视图 choices —— 按「一级目录 → 二级目录 → 三级目录 → POD情况」逐层选择
     2. 方案选择 planPick —— 末层列出该情形下的全部方案卡片：
                              方案思路 + 可在文本框内编辑的回复话术 + 一键复制
     3. 判定结果 result  —— 采用某个方案后展示完整结论
   ============================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------
     0. 数据与常量
     -------------------------------------------------- */
  var DATA       = window.APP_DATA || {};
  var GLOSSARY   = DATA.glossary || {};
  var SCENARIOS  = DATA.scenarios || [];
  var META       = DATA.meta || {};
  var PLACEHOLDER = META.placeholder || '/';
  var SOURCE_FILE = META.source || '长表结构.md';

  /** 层级字段顺序（长表结构.md 的四级目录 + POD情况） */
  var FIELDS = ['l1', 'l2', 'l3', 'pod'];

  var LANG_KEY = 'gofo_mail_lang';
  var LANGS = ['zh', 'en'];

  /* --------------------------------------------------
     1. 安全存储（隐私模式 / 禁用 storage 时不报错）
     -------------------------------------------------- */
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  var currentLang = storageGet(LANG_KEY);
  if (LANGS.indexOf(currentLang) === -1) currentLang = 'zh';

  /* --------------------------------------------------
     2. 界面文案（i18n）
     -------------------------------------------------- */
  var LANG_META = {
    zh: { label: '中文',     htmlLang: 'zh-CN', title: '邮件回复决策助手 · GOFO 客服服务部' },
    en: { label: 'English',  htmlLang: 'en',    title: 'Email Reply Decision Assistant · GOFO Customer Service' }
  };

  var I18N = {
    appTitle: {
      zh: '📧 邮件回复决策助手',
      en: '📧 Email Reply Decision Assistant'
    },
    prioLabel: {
      zh: '场景优先级：<span class="priority-safe">安全类</span> &gt; 服务类 &gt; 时效类 &gt; 需求类 &gt; 其他类',
      en: 'Priority: <span class="priority-safe">Security</span> &gt; Service &gt; Timeliness &gt; Requests &gt; Others'
    },
    hintText: {
      zh: '💡 <b>用法</b>：先在 Udesk 打开邮件、在 CPS 查好运单轨迹，再按「一级目录 → 二级目录 → 三级目录 → POD情况」逐层选择。末层会列出该情形下的全部<b>回复方案</b>，每个方案内都带<b>可编辑话术文本框</b>和<b>一键复制</b>。本工具只做辅助判断，<b style="color:#E73F1E;">具体情形仍须具体分析</b>。',
      en: '💡 <b>How to use</b>: open the email in Udesk and check the tracking in CPS, then select level by level (Category → Sub-category → Situation → POD). The last step lists every <b>reply plan</b> for that case, each with an <b>editable script box</b> and <b>one-click copy</b>. This tool only assists your judgement — <b style="color:#E73F1E;">every case must still be reviewed individually</b>.'
    },
    breadcrumbPath: { zh: '<b>决策路径：</b> 开始 → ', en: '<b>Path:</b> Start → ' },
    breadcrumbEnd:  { zh: '结论✌🏻', en: 'Result✌🏻' },
    breadcrumbSep:  { zh: ' › ', en: ' › ' },

    /* 层级问题 */
    stepWord:   { zh: '第 {0} 步', en: 'Step {0}' },
    fieldName: {
      l1:  { zh: '一级目录', en: 'Category' },
      l2:  { zh: '二级目录', en: 'Sub-category' },
      l3:  { zh: '三级目录', en: 'Situation' },
      pod: { zh: 'POD情况',  en: 'POD status' }
    },
    questionOf: {
      l1:  { zh: '这封邮件属于哪一类？',           en: 'Which top-level category does this case belong to?' },
      l2:  { zh: '具体属于哪个二级目录？',          en: 'Which sub-category is it?' },
      l3:  { zh: '具体是哪种情形？',               en: 'Which specific situation is it?' },
      pod: { zh: 'POD（投递照片）情况如何？',       en: 'What is the POD (proof of delivery) status?' }
    },

    /* 方案选择 */
    planPickTag:   { zh: '方案选择', en: 'Plan selection' },
    planPickTitle: { zh: '本情形下有 {0} 个回复方案，请核对后选择：', en: '{0} reply plan(s) match this case — review and pick one:' },
    planWord:      { zh: '方案 {0}', en: 'Plan {0}' },
    optionCount:   { zh: '{0} 个方案', en: '{0} plan(s)' },

    approachLabel: { zh: '方案思路', en: 'Approach' },
    approachEmpty: {
      zh: '（长表中该行未填写方案思路，请直接按话术处理）',
      en: '(No approach recorded in the source table for this row — follow the script as written.)'
    },
    approachZhOnly: { zh: '', en: ' · Chinese source text' },
    sopLabel:      { zh: 'SOP 登记', en: 'SOP registration' },

    scriptLabel:   { zh: '回复话术', en: 'Reply script' },
    scriptZhTab:   { zh: '中文话术', en: '中文话术 · Chinese' },
    scriptEnTab:   { zh: 'English Script', en: 'English Script' },
    scriptTip: {
      zh: '可直接在文本框内编辑，修改仅保存在本次会话中；点「恢复原文」可还原长表原始话术。',
      en: 'Edit freely in the box — changes live for this session only. Click "Restore original" to revert to the source-table script.'
    },
    editedBadge: { zh: '已修改', en: 'Edited' },

    btnCopyScript: { zh: '📋 一键复制话术', en: '📋 Copy script' },
    btnResetScript: { zh: '↺ 恢复原文', en: '↺ Restore original' },
    btnAdopt:      { zh: '✓ 采用此方案', en: '✓ Use this plan' },
    btnBack:       { zh: '← 上一步', en: '← Back' },
    btnRestart:    { zh: '↻ 重新开始', en: '↻ Restart' },
    btnCopyAll:    { zh: '🧾 复制完整结论', en: '🧾 Copy full conclusion' },

    resultHead:    { zh: '✅ 判定结果', en: '✅ Result' },
    rowPath:       { zh: '场景路径', en: 'Scenario path' },
    rowCategory:   { zh: '登记类别', en: 'Registration category' },
    rowScript:     { zh: '回复话术', en: 'Reply script' },
    rowApproach:   { zh: '方案思路', en: 'Approach' },

    sourceText:    { zh: '《{0}》序号 {1}', en: '{0} · row {1}' },
    officialNote:  { zh: '', en: 'Official Chinese classification:' },

    copyDone:      { zh: '✓ 已复制', en: '✓ Copied' },
    copyFail:      { zh: '复制失败，请手动复制：\n\n', en: 'Copy failed — please copy manually:\n\n' },
    copyTitlePath: { zh: '【场景路径】', en: '[Scenario path] ' },
    copyTitleApproach: { zh: '【方案思路】', en: '[Approach] ' },
    copyTitleSop:  { zh: '【SOP 登记】', en: '[SOP registration] ' },
    copyTitleScript: { zh: '【回复话术】', en: '[Reply script] ' },
    copyTitleCategory: { zh: '【登记类别】', en: '[Registration category] ' },
    copyTitleSource: { zh: '【依据】', en: '[Source] ' },

    langSwitchTitle: { zh: 'Switch to English', en: '切换为中文' },
    dataMissing: {
      zh: '⚠️ 数据未加载：请确认 js/data.js 已正确引入。',
      en: '⚠️ Data not loaded: make sure js/data.js is included.'
    }
  };

  /** 读取文案；支持 'fieldName.l1' 形式的点号路径 */
  function lookup(key) {
    if (Object.prototype.hasOwnProperty.call(I18N, key)) return I18N[key];
    var parts = key.split('.');
    var node = I18N;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  function t(key) {
    var entry = lookup(key);
    if (!entry) return '[MISSING:' + key + ']';
    var text = entry[currentLang] !== undefined ? entry[currentLang] : entry.zh;
    for (var i = 1; i < arguments.length; i++) {
      text = text.split('{' + (i - 1) + '}').join(arguments[i]);
    }
    return text;
  }

  /* --------------------------------------------------
     3. 术语本地化
     -------------------------------------------------- */
  /** 术语在当前语言下的显示名（英文缺失时回退中文原文） */
  function label(zhTerm) {
    if (!zhTerm || zhTerm === PLACEHOLDER) return '';
    if (currentLang === 'en') return GLOSSARY[zhTerm] || zhTerm;
    return zhTerm;
  }

  /** 术语在「另一种语言」下的显示名，用于副标题（无译名则返回空串） */
  function altLabel(zhTerm) {
    if (!zhTerm || zhTerm === PLACEHOLDER) return '';
    if (currentLang === 'en') return zhTerm;              // 英文界面副标题显示中文原文
    return GLOSSARY[zhTerm] || '';                        // 中文界面副标题显示英文译名
  }

  /** 场景的层级路径（原始中文术语数组，跳过占位符） */
  function rawPathOf(sc) {
    var out = [];
    for (var i = 0; i < FIELDS.length; i++) {
      var v = sc[FIELDS[i]];
      if (v && v !== PLACEHOLDER) out.push(v);
    }
    return out;
  }

  /* --------------------------------------------------
     4. 构建决策树
     -------------------------------------------------- */
  function isLeaf(node) { return !!(node && node.scenario); }

  function buildTree() {
    var root = { id: 'root', field: null, name: '', children: [] };
    SCENARIOS.forEach(function (sc) {
      var parent = root;
      FIELDS.forEach(function (field) {
        var value = sc[field];
        if (!value || value === PLACEHOLDER) return;
        var node = null;
        for (var i = 0; i < parent.children.length; i++) {
          if (parent.children[i].name === value && parent.children[i].field === field) {
            node = parent.children[i];
            break;
          }
        }
        if (!node) {
          node = {
            id: parent.id + '|' + field + ':' + value,
            field: field,
            name: value,
            children: [],
            parent: parent
          };
          parent.children.push(node);
        }
        parent = node;
      });
      parent.children.push({
        id: parent.id + '|leaf:' + sc.no,
        field: 'leaf',
        name: sc.sub,
        scenario: sc,
        children: [],
        parent: parent
      });
    });
    return root;
  }

  var TREE = buildTree();

  /* --------------------------------------------------
     5. 应用状态
     -------------------------------------------------- */
  var state = {
    path: [],        // 已选择的节点（不含叶子）
    adoptedNo: null, // 已采用的方案序号
    scriptLang: {},  // 方案序号 -> 话术语言（用户在该卡片上的显式选择）
    drafts: {}       // "序号|语言" -> 编辑后的话术（仅本次会话）
  };

  function draftKey(no, lang) { return no + '|' + lang; }
  function hasDraft(no, lang) {
    return Object.prototype.hasOwnProperty.call(state.drafts, draftKey(no, lang));
  }
  function scriptText(sc, lang) {
    var k = draftKey(sc.no, lang);
    if (hasDraft(sc.no, lang)) return state.drafts[k];
    return lang === 'en' ? sc.en : sc.zh;
  }
  function setDraft(no, lang, text) { state.drafts[draftKey(no, lang)] = text; }
  function clearDraft(no, lang) { delete state.drafts[draftKey(no, lang)]; }

  /* --------------------------------------------------
     6. DOM 引用
     -------------------------------------------------- */
  var stage      = document.getElementById('stage');
  var breadcrumb = document.getElementById('breadcrumb');

  /* --------------------------------------------------
     7. 通用工具
     -------------------------------------------------- */
  function createEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function scrollToTop() {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }

  function makeRow(key, value) {
    var row = createEl('div', 'row');
    row.appendChild(createEl('div', 'k', key));
    var v = createEl('div', 'v');
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (item === null || item === undefined) return;
        v.appendChild(typeof item === 'string' ? document.createTextNode(item) : item);
      });
    } else if (value instanceof Node) {
      v.appendChild(value);
    } else {
      v.textContent = value === undefined || value === null ? '' : String(value);
    }
    row.appendChild(v);
    return row;
  }

  function badgeSpan(className, text) {
    return createEl('span', 'badge ' + className, text);
  }

  function copyText(text, button) {
    function done() {
      if (!button) return;
      var original = button.getAttribute('data-original') || button.textContent;
      button.setAttribute('data-original', original);
      button.textContent = t('copyDone');
      button.classList.add('copied');
      window.setTimeout(function () {
        button.textContent = original;
        button.classList.remove('copied');
      }, 1600);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) done();
      else window.alert(t('copyFail') + text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  /* --------------------------------------------------
     8. 话术编辑器（文本框 + 语言切换 + 一键复制）
     -------------------------------------------------- */
  function cardLang(sc) {
    return state.scriptLang[sc.no] || currentLang;
  }

  function buildScriptEditor(sc, options) {
    options = options || {};
    var root = createEl('div', 'script-editor');

    var head = createEl('div', 'script-head');
    if (options.showLabel !== false) {
      head.appendChild(createEl('span', 'script-label', t('scriptLabel')));
    }

    var tabs = createEl('div', 'lang-tabs');
    var textarea = document.createElement('textarea');
    textarea.className = 'script-box';
    textarea.spellcheck = false;
    textarea.setAttribute('rows', '10');
    textarea.setAttribute('aria-label', t('scriptLabel'));

    function sync() {
      var lang = cardLang(sc);
      textarea.value = scriptText(sc, lang);
      Array.prototype.forEach.call(tabs.children, function (btn) {
        var active = btn.getAttribute('data-lang') === lang;
        btn.className = 'lang-tab' + (active ? ' active' : '');
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      root.setAttribute('data-edited', hasDraft(sc.no, lang) ? 'true' : 'false');
    }

    [['zh', t('scriptZhTab')], ['en', t('scriptEnTab')]].forEach(function (pair) {
      var btn = createEl('button', 'lang-tab', pair[1]);
      btn.type = 'button';
      btn.setAttribute('data-lang', pair[0]);
      btn.addEventListener('click', function () {
        state.scriptLang[sc.no] = pair[0];
        sync();
      });
      tabs.appendChild(btn);
    });

    head.appendChild(tabs);
    head.appendChild(createEl('span', 'badge b-report edited-badge', t('editedBadge')));
    root.appendChild(head);
    root.appendChild(textarea);

    textarea.addEventListener('input', function () {
      setDraft(sc.no, cardLang(sc), textarea.value);
      root.setAttribute('data-edited', 'true');
    });

    root.appendChild(createEl('div', 'script-tip', t('scriptTip')));

    sync();
    root.__sync      = sync;
    root.__textarea  = textarea;
    root.__lang      = function () { return cardLang(sc); };
    root.__reset     = function () {
      clearDraft(sc.no, cardLang(sc));
      sync();
    };
    root.__value     = function () { return textarea.value; };
    return root;
  }

  /* --------------------------------------------------
     9. 视图一：逐层选择
     -------------------------------------------------- */
  function childFieldOf(node) {
    return node.children.length ? node.children[0].field : null;
  }

  function stepTag(node, stepNo) {
    var field = childFieldOf(node);
    var name = field && I18N.fieldName[field] ? t('fieldName.' + field) : '';
    var no = t('stepWord', stepNo);
    return name ? no + ' · ' + name : no;
  }

  function optionShape(field) {
    // 短标签用网格，长标签用纵向列表，避免中文长句被挤压
    if (field === 'l1') return { cls: 'opts-grid', base: 'opt-grid', cols: 3 };
    if (field === 'l2') return { cls: 'opts', base: 'opt' };
    if (field === 'l3') return { cls: 'opts', base: 'opt' };
    if (field === 'pod') return { cls: 'opts-grid', base: 'opt-grid', cols: 2 };
    return { cls: 'opts', base: 'opt' };
  }

  function renderChoices(node) {
    var card = createEl('div', 'card');
    var field = childFieldOf(node);
    var stepNo = state.path.length + 1;

    var title = createEl('div', 'q-title');
    title.appendChild(createEl('span', 'tag', stepTag(node, stepNo)));
    title.appendChild(document.createTextNode(t('questionOf.' + field)));
    card.appendChild(title);

    var shape = optionShape(field);
    var optsDiv = createEl('div', shape.cls);
    if (shape.cols) optsDiv.style.setProperty('--grid-cols', String(shape.cols));

    node.children.forEach(function (child) {
      var btn = createEl('button', shape.base, label(child.name));
      btn.type = 'button';
      var alt = altLabel(child.name);
      if (alt) btn.title = alt;
      var count = child.children.length;
      if (shape.base === 'opt' && count > 1) {
        btn.appendChild(createEl('small', '', t('optionCount', count)));
      }
      btn.addEventListener('click', function () { choose(child); });
      optsDiv.appendChild(btn);
    });

    card.appendChild(optsDiv);
    card.appendChild(navButtons(false));
    stage.appendChild(card);
  }

  /* --------------------------------------------------
     10. 视图二：方案选择（方案卡片内含可编辑话术 + 一键复制）
     -------------------------------------------------- */
  function renderPlanPick(node) {
    var leaves = node.children.filter(isLeaf);
    var card = createEl('div', 'card');

    var title = createEl('div', 'q-title');
    title.appendChild(createEl('span', 'tag', t('planPickTag')));
    title.appendChild(document.createTextNode(t('planPickTitle', leaves.length)));
    card.appendChild(title);

    var list = createEl('div', 'plan-list');
    leaves.forEach(function (leaf, index) {
      list.appendChild(buildPlanCard(leaf, index));
    });
    card.appendChild(list);

    card.appendChild(navButtons(false));
    stage.appendChild(card);
  }

  function buildPlanCard(leaf, index) {
    var sc = leaf.scenario;
    var wrap = createEl('div', 'plan-card');
    wrap.setAttribute('data-no', String(sc.no));

    /* 头部：方案编号 + 子场景名（当前语言）+ 另一语言副标题 */
    var head = createEl('div', 'plan-head');
    head.appendChild(createEl('span', 'plan-no', t('planWord', pad2(index + 1))));
    var titleWrap = createEl('div', 'plan-title-wrap');
    titleWrap.appendChild(createEl('div', 'plan-title', label(leaf.name)));
    var alt = altLabel(leaf.name);
    if (alt) titleWrap.appendChild(createEl('div', 'plan-alt', alt));
    head.appendChild(titleWrap);
    wrap.appendChild(head);

    /* 方案思路 + SOP 登记 */
    var approach = createEl('div', 'plan-approach');
    approach.appendChild(createEl('span', 'plan-k', t('approachLabel')));
    if (sc.plan) {
      var planText = createEl('span', 'plan-v', sc.plan);
      if (currentLang === 'en') {
        planText.appendChild(createEl('span', 'plan-src-note', t('approachZhOnly')));
      }
      approach.appendChild(planText);
    } else {
      approach.appendChild(createEl('span', 'plan-v plan-v-empty', t('approachEmpty')));
    }
    wrap.appendChild(approach);

    /* 可编辑话术文本框 + 语言切换 */
    var editor = buildScriptEditor(sc);
    wrap.appendChild(editor);

    /* 操作按钮 */
    var actions = createEl('div', 'plan-actions');

    var copyBtn = createEl('button', 'btn small', t('btnCopyScript'));
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', function () {
      copyText(editor.__value(), copyBtn);
    });
    actions.appendChild(copyBtn);

    var resetBtn = createEl('button', 'btn small ghost', t('btnResetScript'));
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', function () { editor.__reset(); });
    actions.appendChild(resetBtn);

    var adoptBtn = createEl('button', 'btn primary small', t('btnAdopt'));
    adoptBtn.type = 'button';
    adoptBtn.addEventListener('click', function () {
      state.adoptedNo = sc.no;
      render();
    });
    actions.appendChild(adoptBtn);

    wrap.appendChild(actions);
    return wrap;
  }

  /* --------------------------------------------------
     11. 视图三：判定结果
     -------------------------------------------------- */
  function renderResult(sc) {
    var card = createEl('div', 'card');
    card.appendChild(createEl('div', 'res-head', t('resultHead')));

    /* 场景路径（当前语言） */
    var pathChips = rawPathOf(sc).map(function (term) {
      return badgeSpan('b-cat', label(term));
    });
    pathChips.push(badgeSpan('b-cat', label(sc.sub)));
    card.appendChild(makeRow(t('rowPath'), pathChips));

    /* 方案思路 */
    var approachValue;
    if (sc.plan) {
      approachValue = createEl('span', 'plan-v', sc.plan);
      if (currentLang === 'en') {
        approachValue.appendChild(createEl('span', 'plan-src-note', t('approachZhOnly')));
      }
    } else {
      approachValue = createEl('span', 'plan-v plan-v-empty', t('approachEmpty'));
    }
    card.appendChild(makeRow(t('rowApproach'), approachValue));

    if (sc.sop) {
      card.appendChild(makeRow(t('sopLabel'), [badgeSpan('b-report', sc.sop)]));
    }

    /* 回复话术：可编辑文本框 + 一键复制 */
    var editor = buildScriptEditor(sc, { showLabel: false });

    var editorRow = createEl('div', 'row row-block');
    editorRow.appendChild(createEl('div', 'k', t('rowScript')));
    var editorValue = createEl('div', 'v v-block');
    editorValue.appendChild(editor);
    var editorActions = createEl('div', 'plan-actions');
    var copyBtn = createEl('button', 'btn small', t('btnCopyScript'));
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', function () { copyText(editor.__value(), copyBtn); });
    editorActions.appendChild(copyBtn);
    var resetBtn = createEl('button', 'btn small ghost', t('btnResetScript'));
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', function () { editor.__reset(); });
    editorActions.appendChild(resetBtn);
    editorValue.appendChild(editorActions);
    editorRow.appendChild(editorValue);
    card.appendChild(editorRow);

    /* 登记类别：官方中文分类（生产登记以此为准） */
    var official = rawPathOf(sc).map(function (term) { return badgeSpan('b-cat', term); });
    official.push(badgeSpan('b-cat', sc.sub));
    var officialBox = createEl('div', 'official-box');
    if (currentLang === 'en') {
      officialBox.appendChild(createEl('div', 'official-note', t('officialNote')));
    }
    var officialRow = createEl('div', 'official-chips');
    official.forEach(function (chip) { officialRow.appendChild(chip); });
    officialBox.appendChild(officialRow);
    card.appendChild(makeRow(t('rowCategory'), officialBox));

    /* 依据 */
    card.appendChild(createEl('div', 'ref', t('sourceText', SOURCE_FILE, sc.no)));

    /* 底部按钮 */
    var btnsDiv = createEl('div', 'btns');
    var backBtn = createEl('button', 'btn', t('btnBack'));
    backBtn.type = 'button';
    backBtn.addEventListener('click', goBack);
    btnsDiv.appendChild(backBtn);

    var restartBtn = createEl('button', 'btn', t('btnRestart'));
    restartBtn.type = 'button';
    restartBtn.addEventListener('click', restart);
    btnsDiv.appendChild(restartBtn);

    var copyAllBtn = createEl('button', 'btn primary', t('btnCopyAll'));
    copyAllBtn.type = 'button';
    copyAllBtn.addEventListener('click', function () {
      copyText(buildFullConclusion(sc, editor.__value()), copyAllBtn);
    });
    btnsDiv.appendChild(copyAllBtn);

    card.appendChild(btnsDiv);
    stage.appendChild(card);
  }

  function buildFullConclusion(sc, script) {
    var path = rawPathOf(sc).map(label).concat([label(sc.sub)]);
    var official = rawPathOf(sc).concat([sc.sub]);
    var parts = [];
    parts.push(t('copyTitlePath') + path.join(' › '));
    if (sc.plan) parts.push(t('copyTitleApproach') + sc.plan);
    if (sc.sop) parts.push(t('copyTitleSop') + sc.sop);
    parts.push(t('copyTitleScript') + '\n' + script);
    parts.push(t('copyTitleCategory') + official.join(' › '));
    parts.push(t('copyTitleSource') + t('sourceText', SOURCE_FILE, sc.no));
    return parts.join('\n');
  }

  /* --------------------------------------------------
     12. 导航
     -------------------------------------------------- */
  function navButtons(withBack) {
    var div = createEl('div', 'btns');
    if (withBack || state.path.length > 0) {
      var backBtn = createEl('button', 'btn', t('btnBack'));
      backBtn.type = 'button';
      backBtn.addEventListener('click', goBack);
      div.appendChild(backBtn);
    }
    var restartBtn = createEl('button', 'btn', t('btnRestart'));
    restartBtn.type = 'button';
    restartBtn.addEventListener('click', restart);
    div.appendChild(restartBtn);
    return div;
  }

  /** 选择某个节点：压入路径，并自动跳过只有一个子分支的中间层 */
  function choose(node) {
    state.path.push(node);
    autoAdvance();
    render();
  }

  function autoAdvance() {
    while (true) {
      var current = state.path[state.path.length - 1];
      if (!current || current.children.length !== 1) break;
      var only = current.children[0];
      if (isLeaf(only)) break;                 // 只剩一个方案也走「方案选择」卡片视图
      state.path.push(only);
    }
  }

  function goBack() {
    if (state.adoptedNo !== null) {
      state.adoptedNo = null;
      render();
      return;
    }
    if (state.path.length === 0) return;
    state.path.pop();
    // 回退时跳过被自动跳过的中间层
    while (state.path.length > 0) {
      var last = state.path[state.path.length - 1];
      if (last.children.length === 1 && !isLeaf(last.children[0])) state.path.pop();
      else break;
    }
    render();
  }

  function restart() {
    state.path.length = 0;
    state.adoptedNo = null;
    render();
  }

  /* --------------------------------------------------
     13. 主渲染
     -------------------------------------------------- */
  function currentNode() {
    return state.path.length ? state.path[state.path.length - 1] : TREE;
  }

  function render() {
    stage.innerHTML = '';

    if (!SCENARIOS.length) {
      var err = createEl('div', 'card');
      err.appendChild(createEl('p', 'empty-msg', t('dataMissing')));
      stage.appendChild(err);
      updateBreadcrumb();
      return;
    }

    if (state.adoptedNo !== null) {
      var sc = null;
      for (var i = 0; i < SCENARIOS.length; i++) {
        if (SCENARIOS[i].no === state.adoptedNo) { sc = SCENARIOS[i]; break; }
      }
      if (sc) { renderResult(sc); } else { state.adoptedNo = null; render(); return; }
    } else {
      var node = currentNode();
      if (node.children.length && node.children.every(isLeaf)) {
        renderPlanPick(node);
      } else {
        renderChoices(node);
      }
    }

    updateBreadcrumb();
    scrollToTop();
  }

  function updateBreadcrumb() {
    var parts = state.path.map(function (node) { return label(node.name); });
    var html = t('breadcrumbPath');
    html += parts.length ? parts.join(t('breadcrumbSep')) : '';
    if (state.adoptedNo !== null) {
      html += (parts.length ? t('breadcrumbSep') : '') + t('breadcrumbEnd');
    }
    breadcrumb.innerHTML = html;
  }

  /* --------------------------------------------------
     14. 语言切换与静态文案
     -------------------------------------------------- */
  function applyStaticText() {
    var h1 = document.getElementById('appTitle');
    if (h1) h1.textContent = t('appTitle');
    var prio = document.getElementById('prioText');
    if (prio) prio.innerHTML = t('prioLabel');
    var hint = document.getElementById('hintText');
    if (hint) hint.innerHTML = t('hintText');

    var labelEl = document.getElementById('langLabel');
    if (labelEl) labelEl.textContent = LANG_META[currentLang].label;
    var btn = document.getElementById('langSwitch');
    if (btn) {
      btn.title = t('langSwitchTitle');
      btn.setAttribute('aria-label', t('langSwitchTitle'));
    }

    var noscript = document.getElementById('noscriptMsg');
    if (noscript) {
      noscript.textContent = currentLang === 'en'
        ? '⚠️ Please enable JavaScript to use this tool.'
        : '⚠️ 请启用 JavaScript 以使用此工具。';
    }

    document.documentElement.lang = LANG_META[currentLang].htmlLang;
    document.title = LANG_META[currentLang].title;
  }

  function switchLang(lang) {
    if (LANGS.indexOf(lang) === -1 || lang === currentLang) return;
    currentLang = lang;
    storageSet(LANG_KEY, lang);
    applyStaticText();
    render();
  }

  function init() {
    applyStaticText();
    var btn = document.getElementById('langSwitch');
    if (btn) {
      btn.addEventListener('click', function () {
        switchLang(currentLang === 'zh' ? 'en' : 'zh');
      });
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
