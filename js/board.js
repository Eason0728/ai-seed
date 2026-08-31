
(function(){
  var S={people:[],rev:0};

  var dirty=false, saving=false, openId=null, seq=0;
  function canEdit(){ return !!(admin || me); }
  var reviewMode=false;   // 只影響這台裝置的這次瀏覽，不會存進資料
  var STATUS=['未開始','做出來','在用'];
  var LESSONS=['01','02','03','04','★'];   // 四堂課 ＋ 10/07 成果分享
  var WPM=4.33;

  var BRANDS='<div class="brands">'+
    '<img src="assets/tile_mzt.png" alt="墨竹亭燃麵本家">'+
    '<img src="assets/tile_mala.png" alt="麻的小辛辣">'+
    '<img src="assets/tile_yiwu.png" alt="一悟燒肉">'+
    '</div>';

  /* 取代 confirm／prompt／alert：artifact 沙箱沒有 allow-modals，原生對話框一律無效 */
  function closeAsk(){ var m=document.getElementById('modal'); if(m) m.innerHTML=''; }
  function ask(o, cb){
    closeAsk();
    var host=document.getElementById('modal');
    var w=document.createElement('div'); w.className='mback';
    var hasIn = (o.input!==undefined && o.input!==null);
    w.innerHTML='<div class="mbox" role="dialog" aria-modal="true">'+
      '<h3>'+esc(o.title)+'</h3>'+
      (o.desc?'<p>'+o.desc+'</p>':'')+
      (hasIn?'<input id="mIn" type="text" value="'+esc(o.input)+'" placeholder="'+esc(o.ph||'')+'">':'')+
      '<div class="merr" id="mErr">'+esc(o.err||'')+'</div>'+
      '<div class="mrow">'+
        (o.only?'':'<button id="mNo">取消</button>')+
        '<button id="mYes" class="'+(o.danger?'danger':'pri')+'">'+esc(o.ok||'確定')+'</button>'+
      '</div></div>';
    host.appendChild(w);
    var inp=w.querySelector('#mIn');
    function done(v){
      var sel=w.querySelector('select');
      var extra={ select: sel? sel.value : null };
      closeAsk(); document.removeEventListener('keydown',key,true);
      if(cb) cb(v, extra);
    }
    function key(e){ if(e.key==='Escape'){ e.preventDefault(); done(null); } }
    document.addEventListener('keydown',key,true);
    var no=w.querySelector('#mNo'); if(no) no.addEventListener('click',function(){ done(null); });
    w.querySelector('#mYes').addEventListener('click',function(){ done(inp?inp.value:true); });
    w.addEventListener('click',function(e){ if(e.target===w) done(null); });
    if(inp){ inp.focus(); inp.select();
      inp.addEventListener('keydown',function(e){
        if(e.key==='Enter'){ e.preventDefault(); done(inp.value); } }); }
    else { w.querySelector('#mYes').focus(); }
  }
  function say(title, desc, cb){ ask({title:title, desc:desc, only:true, ok:'知道了'}, function(){ if(cb) cb(); }); }
  function askReject(pp, ii, err){
    ask({title:'退回這一件', desc:'寫一句話告訴學員<strong>要改什麼</strong>——他會在自己的卡片上看到這句。',
         input: ii.rejectNote||'', ph:'例如：一週只做 1 次，「高頻」那項沒過', ok:'退回', err:err||''},
      function(v){
        if(v===null) return;
        v=String(v).trim();
        if(!v){ askReject(pp, ii, '要寫原因，不然學員不知道要改什麼'); return; }
        act('review',{itemId:ii.id, verdict:'reject', note:v}, pp.id);
      });
  }

  function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function num(v){ var n=parseFloat(v); return isFinite(n)&&n>=0?n:null; }
  function fmt(n){ return Number(n).toLocaleString('en-US'); }
  function uid(pre){ seq++; return pre+Date.now().toString(36)+seq.toString(36); }

  /* 舊格式（一人一件）自動轉成 items[]，不會弄丟已填的資料 */
  function migrate(){
    // 舊的八堂進度 → 四堂 ＋ 展示格（取前四堂，第五格是 10/07 展示）
    S.people.forEach(function(p){
      if(!Array.isArray(p.sess)) p.sess=[false,false,false,false,false];
      if(p.sess.length!==5){
        var old=p.sess.slice(0,4);
        while(old.length<4) old.push(false);
        p.sess=old.concat([false]);
      }
    });
    S.people.forEach(function(p){
      if(Array.isArray(p.items)) return;
      p.items=[{ id:uid('i'), topic:p.topic||'', criteria:p.criteria||'', crit:null,
        beforeMin:p.beforeMin||'', perWeek:p.perWeek||'', afterMin:p.afterMin||'',
        status:p.status||0, lastUsed:p.lastUsed||'', blocker:p.blocker||'', needData:p.needData||'' }];
      ['topic','criteria','beforeMin','perWeek','afterMin','status','lastUsed','blocker','needData']
        .forEach(function(k){ delete p[k]; });
    });
    // 欄位補齊：舊的「符合 N 項」轉成前 N 項打勾（正式版尚無資料，這條只為保險）
    S.people.forEach(function(p){
      (p.items||[]).forEach(function(it){
        if(!Array.isArray(it.crit)){
          var n=parseInt(it.criteria,10); if(!isFinite(n)||n<0) n=0; if(n>4) n=4;
          it.crit=[0,1,2,3].map(function(k){ return k<n; });
        }
        delete it.criteria;
        if(typeof it.noBlocker!=='boolean') it.noBlocker=false;
        // 既有資料視為已通過（它本來就秀在看板上了）；新建的一律從 draft 開始
        if(!it.review) it.review = 'approved';
        if(typeof it.rejectNote!=='string') it.rejectNote='';
        if(!it.ana || typeof it.ana!=='object') it.ana={b:'',t:'',w:'',n:''};
        if(typeof it.rejectCount!=='number') it.rejectCount=0;
      });
    });
  }
  migrate();

  var CRIT=[
    ['高頻','這件事我一週至少做 3 次'],
    ['可標準化','每次的步驟都差不多，不是每次都不一樣'],
    ['可驗收','AI 做出來的東西對不對，我自己看得出來'],
    ['風險低','就算 AI 做錯，我發出去之前會發現，不會直接出事']
  ];
  // 審核狀態：draft 還沒送 ／ pending 等審核 ／ approved 已通過（才計入數字）／ rejected 被退回
  var REVIEW={draft:'還沒送審', pending:'等審核', approved:'已通過', rejected:'被退回'};
  // 分析四格（第 01 堂就教，四堂每週更新）：因為＿所以＿，本週先做＿，下週看＿
  var ANA=[
    ['b','因為',  '你看到的事實，最好有數字'],
    ['t','所以',  '你的判斷——這代表什麼'],
    ['w','本週先做','一個具體動作，這週做得完的'],
    ['n','下週看', '一個可以驗證的數字']
  ];
  function newItem(){ return {id:uid('i'), topic:'', crit:[false,false,false,false],
    beforeMin:'', perWeek:'', afterMin:'', status:0, lastUsed:'',
    blocker:'', noBlocker:false, needData:'',
    ana:{b:'',t:'',w:'',n:''}, review:'draft', rejectNote:'', rejectCount:0}; }
  function anaFilled(it){
    var a=it.ana||{}; var n=0;
    ANA.forEach(function(x){ if(String(a[x[0]]||'').trim()) n++; });
    return n;
  }
  function hasAnalysis(p){
    var n=0;
    (p.items||[]).forEach(function(it){ if(isApproved(it)&&anaFilled(it)===4) n++; });
    return n;
  }
  function critCount(it){ var n=0; (it.crit||[]).forEach(function(x){ if(x) n++; }); return n; }
  function newPerson(){ return {id:uid('p'), name:'',
    sess:[false,false,false,false,false], items:[newItem()]}; }
  function find(id){ for(var i=0;i<S.people.length;i++) if(S.people[i].id===id) return S.people[i]; return null; }
  function findItem(p,iid){ for(var i=0;i<p.items.length;i++) if(p.items[i].id===iid) return p.items[i]; return null; }

  function calc(it){
    var b=num(it.beforeMin), a=num(it.afterMin), w=num(it.perWeek);
    if(b===null||w===null) return null;
    var before=b*w*WPM;
    if(a===null) return {partial:true, before:Math.round(before), b:b, w:w};
    var after=a*w*WPM;
    return {partial:false, b:b, a:a, w:w, before:Math.round(before), after:Math.round(after),
      saved:Math.max(Math.round(before)-Math.round(after),0)};
  }
  function itemSaved(it){ var c=calc(it); return (c&&!c.partial)?c.saved:null; }
  function isApproved(it){ return it.review==='approved'; }
  // 只有審核通過的才計入數字
  function personSaved(p){
    var t=null;
    (p.items||[]).forEach(function(it){
      if(!isApproved(it)) return;
      var s=itemSaved(it); if(s!==null) t=(t===null?0:t)+s;
    });
    return t;
  }
  function personStatus(p){
    var m=0; (p.items||[]).forEach(function(it){
      if(!isApproved(it)) return;
      if((it.status||0)>m) m=it.status||0; }); return m;
  }
  function filledItems(p){ var n=0; (p.items||[]).forEach(function(it){
    if(isApproved(it) && itemSaved(it)!==null) n++; }); return n; }
  function approvedCount(p){ var n=0; (p.items||[]).forEach(function(it){ if(isApproved(it)) n++; }); return n; }
  function pendingCount(p){ var n=0; (p.items||[]).forEach(function(it){ if(it.review==='pending') n++; }); return n; }
  function rejectedCount(p){ var n=0; (p.items||[]).forEach(function(it){ if(it.review==='rejected') n++; }); return n; }
  function allPending(){ var n=0; S.people.forEach(function(p){ n+=pendingCount(p); }); return n; }
  function allRejected(){ var n=0; S.people.forEach(function(p){ n+=rejectedCount(p); }); return n; }

  /* ─────────── 第一層 ─────────── */
  function totalHtml(){
    var tot=0, ppl=0, inUse=0, done=0, maxS=0, items=0, ana=0;
    S.people.forEach(function(p){
      var s=personSaved(p);
      if(s!==null){ tot+=s; ppl++; }
      var st=personStatus(p);
      if(st===2) inUse++;
      if(st>=1) done++;
      items+=approvedCount(p);
      if(hasAnalysis(p)>0) ana++;
      var c=0; (p.sess||[]).slice(0,4).forEach(function(x){ if(x) c++; });
      if(c>maxS) maxS=c;
    });
    return '<div class="total"><div class="main">'+
      '<span class="lb">全班每月共省下</span>'+
      '<span class="big">'+(tot?fmt(tot):'—')+'<span class="unit">分鐘</span></span>'+
      '<span class="hrs">'+(tot?('≈ '+(tot/60).toFixed(1)+' 小時／月　·　'+ppl+'/'+S.people.length+' 人有通過的資料')
                              :'還沒有通過審核的資料')+'</span></div>'+
      '<div class="side">'+
        '<div><span class="lb">在用</span><span class="v">'+inUse+' <span class="unit">人</span></span></div>'+
        '<div><span class="lb">做出來以上</span><span class="v">'+done+' <span class="unit">人</span></span></div>'+
        '<div><span class="lb">已通過的事</span><span class="v">'+items+' <span class="unit">件</span></span></div>'+
        '<div><span class="lb" title="有沒有填，不是填得好不好；品質看退回次數">分析填好的</span><span class="v">'+ana+' <span class="unit">/ '+S.people.length+' 人</span></span></div>'+
        '<div><span class="lb">進度最前</span><span class="v">'+maxS+' <span class="unit">/ 4 堂</span></span></div>'+
      '</div></div>';
  }

  function pendHtml(){
    var np=allPending(), nr=allRejected();
    if(reviewMode){
      return '<div class="pend"><b>'+np+'</b> 件等你審核'+
        (nr?'　·　'+nr+' 件已退回、等學員改':'')+
        '<span class="rvbtn"><button class="mini ghost" id="exitRv">離開審核模式</button></span></div>';
    }
    if(me){
      var mp=find(me.code);
      return '<div class="pend" style="border-left-color:var(--s2)">'+
        '你是 <b>'+esc((mp&&mp.name)||me.code)+'</b>　·　只能改自己那一張'+
        '<span class="rvbtn"><button class="mini ghost" id="logoutBtn">換人／登出</button></span></div>';
    }
    if(!np && !nr) return '<div class="pend" style="background:var(--surface);border-left-color:var(--line-2)">'+
      '<span class="msg" style="color:var(--ink-3);font-size:.88rem">目前沒有待審的資料</span>'+
      '<span class="rvbtn"><button class="mini ghost" id="enterRv">審核</button></span></div>';
    return '<div class="pend"><b>'+np+'</b> 件等審核'+(nr?'　·　'+nr+' 件被退回':'')+
      '<span class="rvbtn"><button class="mini ghost" id="enterRv">審核</button></span></div>';
  }

  function peopleHtml(){
    if(!S.people.length) return '<div class="empty">還沒有人。按下面「＋ 新增學員」把 16 個人加進來。</div>';
    return '<div class="people">'+S.people.map(function(p,i){
      var s=personSaved(p), st=personStatus(p), n=(p.items||[]).length;
      var first=(p.items&&p.items[0]&&p.items[0].topic)||'';
      var bars=(p.sess||[]).map(function(x){ return '<i class="'+(x?'on':'')+'"></i>'; }).join('');
      var topicLine = n>1
        ? esc(first||'還沒定題目')+' <span class="pcount">＋另 '+(n-1)+' 件</span>'
        : esc(first||'還沒定題目');
      var np=pendingCount(p), nr=rejectedCount(p);
      return '<button class="pcard" data-open="'+esc(p.id)+'">'+
        '<span class="ptop"><span class="pname">'+esc(p.name||('學員 '+(i+1)))+'</span>'+
          (np?'<span class="pflag">待審 '+np+'</span>':'')+
          (nr?'<span class="pflag rej">退回 '+nr+'</span>':'')+
          '<span class="pill st'+st+'">'+STATUS[st]+'</span></span>'+
        '<span class="pmain">'+(s===null
          ? '<span class="v none">—</span><span class="u">還沒填時間帳</span>'
          : '<span class="v">'+fmt(s)+'</span><span class="u">分鐘 / 月</span>')+'</span>'+
        '<span class="ptopic'+(first?'':' empty')+'">'+topicLine+'</span>'+
        '<span class="pbars">'+bars+'</span></button>';
    }).join('')+'</div>';
  }

  function needsHtml(){
    var rows=[];
    S.people.forEach(function(p){
      (p.items||[]).forEach(function(it){
        var t=String(it.needData||'').trim();
        if(t) rows.push({who:p.name||'（未命名）', topic:it.topic||'（還沒定題目）', what:t});
      });
    });
    var body;
    if(!rows.length){
      body='<div class="none">還沒有人填。任何一堂發現「我需要這個數字但拿不到」，'+
           '當下就寫上來。</div>';
    } else {
      body='<div class="nlist">'+rows.map(function(r){
        return '<div class="nrow"><span class="who">'+esc(r.who)+
               '<small>'+esc(r.topic)+'</small></span>'+
               '<span class="what">'+esc(r.what)+'</span></div>';
      }).join('')+'</div>';
    }
    return '<details class="needs"><summary>他們要不到的數字'+
      '<span class="cnt">'+rows.length+' 筆</span></summary>'+
      '<div class="body"><p class="why">'+
      '學員做分析時撞到的<strong>數據缺口</strong>——這不是他們做不到，是公司沒給他們那個數字。<br>'+
      '<strong>同一個數字有多個人要不到，就是最該優先做的功能。</strong>'+
      '這份清單是 10/07 報告「第二階段要做什麼」那頁的內容。</p>'+
      body+'</div></details>';
  }

  function render(){
    document.getElementById('root').innerHTML=
      '<header>'+BRANDS+'<span class="kick">鼎兆元 · AI 種子計畫</span><h1>學習看板</h1>'+
      '<p class="sub">四堂課（9/3–9/24）＋ 10/07 成果分享。<strong>點任何一個人</strong>看他的算式與細項。一個人可以有不只一件事。不排名、不排序，順序照名冊。</p></header>'+
      '<div id="roBox"></div>'+
      totalHtml()+ pendHtml() +
      '<div class="sechd"><h2>每個人每月省下</h2><span class="hint">'+
        (S.people.length?'點卡片打開細項與算式，改完按「完成並存檔」':'')+'</span></div>'+
      peopleHtml()+
      needsHtml()+
      '<div class="bar">'+
        '<button class="act" id="save">重新整理</button>'+
        '<span class="note" id="msg"></span></div>'+
      '<p class="foot">「每月省下」＝（原本每次分鐘 － 現在每次分鐘）× 每週次數 × 4.33 週；一個人有多件時就是各件加總。'+
      '欄位對應四堂課流程表：題目與四標準＝第 01 堂／狀態＝第 03–04 堂／'+
      '<strong>時間帳與分析四格＝第 01 堂就填，每週更新</strong>／「拿不到的數字」＝任何一堂撞到就寫。<br>'+
      '分析四格填滿會組成一句完整的話——那是總經理 Q2 要的「看得到怎麼想的過程」。<br>'+
      '⚠ 「分析填好的 N／16」是<strong>有沒有填</strong>，不是填得好不好；品質看的是<strong>退回次數</strong>。</p>';
    var ad=document.getElementById('add'); if(ad) ad.addEventListener('click', onAdd);
    document.getElementById('save').addEventListener('click', function(){ pull(); });
    var lo=document.getElementById('logoutBtn'); if(lo) lo.addEventListener('click', function(){ me=null; render(); });
    var er=document.getElementById('enterRv'); if(er) er.addEventListener('click', enterReview);
    var xr=document.getElementById('exitRv');  if(xr) xr.addEventListener('click', function(){
      reviewMode=false; admin=null; render();
    });
    if(!canEdit()) applyReadOnly();
    if(dirty) msg('尚未存檔','');
  }
  function enterReview(err){
    ask({title:'輸入審核通行碼', desc:'只有 Eason 進得來——通過／退回、勾四堂進度。',
         input:'', ok:'進入', err:err||''}, function(v){
      if(v===null) return;
      api('adminAuth',{admin:String(v).trim()}).then(function(){
        admin=String(v).trim(); me=null; reviewMode=true; render();
      }).catch(function(){ enterReview('通行碼不對'); });
    });
  }

  function askPass(pid, err){
    var p=find(pid); if(!p) return;
    ask({title:esc(p.name||pid),
         desc:'要填自己這一張，輸入你的四位數密碼。<b>第一次用的是預設密碼 0000</b>，'+
              '進去之後記得按「改密碼」換掉。<br>只想看看別人的進度就按「取消」。',
         input:'', ph:'四位數密碼', ok:'進入', err:err||''}, function(v){
      if(v===null){ openSheet(pid); return; }
      var pass=String(v).trim();
      api('login',{code:pid, pass:pass}).then(function(d){
        me={code:pid, pass:pass}; admin=null; reviewMode=false;
        S={people:d.people||[], rev:(S.rev||0)+1}; migrate(); render(); openSheet(pid);
        if(d.isDefault) say('這還是預設密碼',
          '你現在用的是預設的 <b>0000</b>，別人猜得到。按下面的「<b>改密碼</b>」換一組只有你知道的四位數。');
      }).catch(function(e){ askPass(pid, (e&&e.error)||'密碼不對'); });
    });
  }

  function changePass(err){
    if(!me) return;
    ask({title:'改密碼', desc:'設一組只有你知道的<b>四位數字</b>。改完下次就用新的。',
         input:'', ph:'新的四位數密碼', ok:'改掉', err:err||''}, function(v){
      if(v===null) return;
      var np=String(v).trim();
      if(!/^[0-9]{4}$/.test(np)){ changePass('要剛好四位數字'); return; }
      api('changePass',{newPass:np}).then(function(d){
        var pid=me.code; me.pass=np;
        S={people:d.people||[], rev:(S.rev||0)+1}; migrate(); render(); openSheet(pid);
        say('改好了','你的新密碼是 <b>'+esc(np)+'</b>，下次用這組登入。');
      }).catch(function(e){ changePass((e&&e.error)||'改不了'); });
    });
  }


  function msg(t,c){ var m=document.getElementById('msg'); if(m){ m.textContent=t; m.className='note'+(c?' '+c:''); } }
  function touch(){ dirty=true; msg('尚未存檔',''); }

  /* ─────────── 第二層 ─────────── */
  function calcHtml(it){
    var c=calc(it);
    if(c===null) return '<div class="calc"><div class="miss">要算出每月省下多少，三格都要填：<strong>原本每次幾分鐘</strong>、<strong>每週幾次</strong>、<strong>現在每次幾分鐘</strong>。</div></div>';
    if(c.partial) return '<div class="calc">'+
      '<div class="cr"><span class="cl">原本</span><span class="ce">'+c.b+' 分 × '+c.w+' 次/週 × 4.33 週</span><span class="cv">'+fmt(c.before)+'</span></div>'+
      '<div class="miss">還差「<strong>現在每次幾分鐘</strong>」。</div></div>';
    return '<div class="calc">'+
      '<div class="cr"><span class="cl">原本</span><span class="ce">'+c.b+' 分 × '+c.w+' 次/週 × 4.33 週</span><span class="cv">'+fmt(c.before)+'</span></div>'+
      '<div class="cr"><span class="cl">現在</span><span class="ce">'+c.a+' 分 × '+c.w+' 次/週 × 4.33 週</span><span class="cv">'+fmt(c.after)+'</span></div>'+
      '<div class="cr res"><span class="cl">省下</span><span class="ce">'+fmt(c.before)+' － '+fmt(c.after)+'</span><span class="cv">'+fmt(c.saved)+' 分/月</span></div>'+
      '<div class="note">≈ '+(c.saved/60).toFixed(1)+' 小時／月。4.33 ＝ 一年 52 週 ÷ 12 個月。</div></div>';
  }
  function fld(lb,inner){ return '<div class="fld"><label>'+esc(lb)+'</label><div>'+inner+'</div></div>'; }
  function opt(v,t,cur){ return '<option value="'+esc(v)+'"'+(String(cur)===String(v)?' selected':'')+'>'+esc(t)+'</option>'; }

  function critHtml(p,it){
    var a='data-id="'+esc(p.id)+'" data-item="'+esc(it.id)+'"';
    var n=critCount(it);
    var rows=CRIT.map(function(c,k){
      return '<label class="critline"><input type="checkbox" data-crit="'+k+'" '+a+
        ((it.crit&&it.crit[k])?' checked':'')+'>'+
        '<span><b>'+esc(c[0])+'</b> — '+esc(c[1])+'</span></label>';
    }).join('');
    var cls = n===4?'full':(n===0?'':'warn');
    var txt = n===4?'四項全中 ✓ 可以做'
            : (n===0?'一項都還沒勾'
                    :'目前 '+n+'／4 —— 規則是四項全中才做，缺的那項要嘛換題目、要嘛把題目縮小');
    return rows+'<div class="critsum '+cls+'">'+esc(txt)+'</div>';
  }

  function blkHtml(p,it){
    var a='data-id="'+esc(p.id)+'" data-item="'+esc(it.id)+'"';
    return '<label class="noblk"><input type="checkbox" data-noblk="1" '+a+
      (it.noBlocker?' checked':'')+'>這件目前沒有卡點</label>'+
      '<textarea data-f="blocker" '+a+' class="'+(it.noBlocker?'off':'')+
      '" placeholder="我還卡在＿＿＿">'+esc(it.blocker)+'</textarea>';
  }

  // 學員在 pending／approved 時不能改；審核模式下 Eason 一律可改
  function locked(it){ return !reviewMode && (it.review==='pending' || it.review==='approved'); }

  function itemFootHtml(p,it){
    var d='data-id="'+esc(p.id)+'" data-item="'+esc(it.id)+'"';
    if(reviewMode){
      if(it.review==='pending')
        return '<div class="ifoot"><button class="mini" data-approve="1" '+d+'>通過</button>'+
               '<button class="mini no" data-reject="1" '+d+'>駁回…</button>'+
               '<span class="msg">通過之後這件的數字才會計入看板</span></div>';
      if(it.review==='approved')
        return '<div class="ifoot"><button class="mini ghost" data-unapprove="1" '+d+'>收回通過</button>'+
               '<span class="msg">收回後會從看板數字扣掉，並退回學員修改</span></div>';
      if(it.review==='rejected')
        return '<div class="ifoot"><button class="mini" data-approve="1" '+d+'>直接通過</button>'+
               '<span class="msg">已退回給學員，等他改完重送</span></div>';
      return '<div class="ifoot"><button class="mini ghost" data-approve="1" '+d+'>直接通過</button>'+
             '<span class="msg">學員還沒送審——你自己代填的話可以直接通過</span></div>';
    }
    if(it.review==='pending')
      return '<div class="ifoot"><button class="mini ghost" data-withdraw="1" '+d+'>撤回修改</button>'+
             '<span class="msg">已送出，等 Eason 審核。要改的話先撤回</span></div>';
    if(it.review==='approved')
      return '<div class="ifoot"><button class="mini ghost" data-withdraw="1" '+d+'>我要修改</button>'+
             '<span class="msg">已通過並計入看板。改了要重新送審，期間會先從數字扣掉</span></div>';
    // draft / rejected
    return '<div class="ifoot"><button class="mini" data-submit="1" '+d+'>送出審核</button>'+
           '<span class="msg">送出後 Eason 會看，通過才會算進看板</span></div>';
  }

  function anaHtml(p,it){
    var a='data-id="'+esc(p.id)+'" data-item="'+esc(it.id)+'"';
    var v=it.ana||{}, n=anaFilled(it);
    var rows=ANA.map(function(x){
      return '<div class="anarow"><span>'+esc(x[1])+'</span>'+
        '<input type="text" data-ana="'+x[0]+'" '+a+' value="'+esc(v[x[0]]||'')+'" placeholder="'+esc(x[2])+'"></div>';
    }).join('');
    var out;
    if(n===4){
      out='<div class="anaout"><b>因為</b> '+esc(v.b)+'<b>，所以</b> '+esc(v.t)+
          '<b>，本週先做</b> '+esc(v.w)+'<b>，下週看</b> '+esc(v.n)+'。</div>';
    } else if(n===0){
      out='<div class="anamiss"><strong>從第 01 堂就填，每週跟時間帳一起更新。</strong>'+
        '第 01–02 堂寫的是「我為什麼挑這件事、要看什麼變化」；'+
        '第 03 堂起，改成分析你這週真的做出來的那份產出。<br>'+
        '四格填滿，下面會組成一句完整的話——那就是交出去不會被問「所以呢」的長相。</div>';
    } else {
      out='<div class="anamiss">還差 '+(4-n)+' 格。<strong>四格缺一格，交出去就會被問「所以呢」。</strong></div>';
    }
    return '<div class="ana" data-ana-box="'+esc(it.id)+'">'+rows+out+'</div>';
  }

  function itemHtml(p,it,idx,total){
    var a='data-id="'+esc(p.id)+'" data-item="'+esc(it.id)+'"';
    var lk=locked(it);
    var rv=it.review||'draft';
    return '<div class="item'+(lk?' locked':'')+'" id="it-'+esc(it.id)+'">'+
      '<div class="ihd"><span class="n">第 '+(idx+1)+' 件'+(total>1?('／共 '+total+' 件'):'')+'</span>'+
        '<span class="rv rv-'+rv+'" data-rvpill="'+esc(it.id)+'">'+REVIEW[rv]+'</span>'+
        (anaFilled(it)===4?'<span class="anaflag" title="四格分析已填滿">分析 ✓</span>':'')+
        (it.rejectCount?'<span class="rejn" title="被退回過的次數">退回 '+it.rejectCount+'</span>':'')+
        '<span class="pill st'+(it.status||0)+'" data-ipill="'+esc(it.id)+'">'+STATUS[it.status||0]+'</span>'+
        (total>1&&!lk?'<button class="idel" data-delitem="'+esc(it.id)+'" data-id="'+esc(p.id)+'">移除這件</button>':'')+
      '</div>'+
      '<div class="ibody">'+
        (rv==='rejected'&&it.rejectNote
          ? '<div class="rejbox"><b>被退回的原因</b>'+esc(it.rejectNote)+'</div>' : '')+
        '<div data-calc="'+esc(it.id)+'">'+calcHtml(it)+'</div>'+
        fld('題目','<input type="text" data-f="topic" '+a+' value="'+esc(it.topic)+'" placeholder="每週重複三次以上、最煩的那件事">')+
        fld('四標準','<div class="crit" data-crit-box="'+esc(it.id)+'">'+critHtml(p,it)+'</div>')+
        fld('原本','<span class="mins">每次 <input type="number" min="0" data-f="beforeMin" '+a+' value="'+esc(it.beforeMin)+'"> 分 × 每週 <input type="number" min="0" data-f="perWeek" '+a+' value="'+esc(it.perWeek)+'"> 次</span>')+
        fld('現在','<span class="mins">每次 <input type="number" min="0" data-f="afterMin" '+a+' value="'+esc(it.afterMin)+'"> 分</span>')+
        fld('狀態','<select data-f="status" '+a+'>'+
          opt('0','未開始',String(it.status||0))+opt('1','做出來了',String(it.status||0))+opt('2','在用',String(it.status||0))+'</select>')+
        fld('最近用','<input type="date" data-f="lastUsed" '+a+' value="'+esc(it.lastUsed)+'">'+
            '<div class="hintline">每真的用一次就改成當天。10/07 會對照你資料夾裡的檔案日期。</div>')+
        fld('卡點','<div data-blk-box="'+esc(it.id)+'">'+blkHtml(p,it)+'</div>')+
        fld('缺數字','<textarea data-f="needData" '+a+' placeholder="我需要但拿不到的數字（任何一堂撞到就寫）">'+esc(it.needData)+'</textarea>')+
        fld('分析', anaHtml(p,it))+
      '</div>'+ itemFootHtml(p,it) +'</div>';
  }

  function anySaved(p){   // 不管審核狀態，只要數字填完就算
    var t=null;
    (p.items||[]).forEach(function(it){ var s=itemSaved(it); if(s!==null) t=(t===null?0:t)+s; });
    return t;
  }
  function anyFilled(p){ var n=0; (p.items||[]).forEach(function(it){
    if(itemSaved(it)!==null) n++; }); return n; }

  function sumHtml(p){
    var ok=personSaved(p), all=anySaved(p);
    var n=(p.items||[]).length, fOk=filledItems(p), fAll=anyFilled(p);
    if(all===null)
      return '<span class="lb">這個人每月共省下</span>'+
        '<span class="sumline"><span class="v none">—</span>'+
        '<span class="u">填「原本每次幾分鐘、一週幾次、現在每次幾分鐘」就會自動算</span></span>';
    if(ok===null)   // 有數字但還沒有任何一件通過
      return '<span class="lb">這個人每月共省下</span>'+
        '<span class="sumline"><span class="v pend">'+fmt(all)+'</span>'+
        '<span class="u">分鐘 / 月　·　'+fAll+'/'+n+' 件已填完</span></span>'+
        '<span class="subnote">還沒通過審核，<strong>先不算進全班總數</strong>——送出審核、Eason 通過之後才會計入。</span>';
    if(all!==ok)    // 有通過的，也有還沒通過的
      return '<span class="lb">這個人每月共省下</span>'+
        '<span class="sumline"><span class="v">'+fmt(ok)+'</span>'+
        '<span class="u">分鐘 / 月　·　'+fOk+'/'+n+' 件已通過</span></span>'+
        '<span class="subnote">另有還沒通過的 <strong>'+fmt(all-ok)+'</strong> 分鐘，通過後才會加進來。</span>';
    return '<span class="lb">這個人每月共省下</span>'+
      '<span class="sumline"><span class="v">'+fmt(ok)+'</span>'+
      '<span class="u">分鐘 / 月　·　'+fOk+'/'+n+' 件已通過</span></span>';
  }

  function sheetHtml(p){
    var n=(p.items||[]).length;
    return '<div class="back" id="back"><div class="sheet" role="dialog" aria-modal="true" aria-label="學員細項">'+
      '<div class="shd">'+
        '<input class="nm" type="text" data-f="name" data-id="'+esc(p.id)+'" value="'+esc(p.name)+'" placeholder="姓名" aria-label="姓名">'+
        '<button class="x" id="closeX" aria-label="關閉">✕</button></div>'+
      '<div class="sbody">'+
        '<div class="pertop" id="perTop">'+sumHtml(p)+
          '<div><span class="lb" style="display:block;margin-bottom:.35rem">四堂進度 ＋ ★ 10/07 分享'+
            (reviewMode?'（你可以改）'
                       :'（學員不能自己勾——<button class="lnk" data-torv="1">進審核模式</button>才能改）')+'</span>'+
          '<span class="sess">'+LESSONS.map(function(l,k){
            return '<button data-sess="'+esc(p.id)+'" data-k="'+k+'" class="'+((p.sess&&p.sess[k])?'on':'')+'"'+
              (reviewMode?'':' disabled')+' title="'+(k<4?('第 '+l+' 堂交件通過'):'10/07 成果分享（現場或線上都算）')+'">'+l+'</button>';
          }).join('')+'</span></div>'+
        '</div>'+
        p.items.map(function(it,i){ return itemHtml(p,it,i,n); }).join('')+
        '<button class="additem" id="addItem" data-id="'+esc(p.id)+'">＋ 再加一件事</button>'+
      '</div>'+
      '<div class="sfoot">'+
        '<button class="act" id="doneBtn">完成並存檔</button>'+
        (me && me.code===p.id ? '<button class="act ghost" id="pwBtn">改密碼</button>' : '')+
        '<span class="note" id="sMsg"></span>'+

      '</div></div></div>';
  }

  function openSheet(id, focusItemId){
    var p=find(id); if(!p) return;
    openId=id;
    document.getElementById('layer').innerHTML=sheetHtml(p);
    var mine = admin || (me && me.code===p.id);
    if(!mine){
      document.querySelectorAll('#layer input,#layer select,#layer textarea,#layer .sess button,#layer .del,#layer .idel,#layer .additem,#layer .mini,#layer .act')
        .forEach(function(x){ x.disabled=true; });
      var sm=document.getElementById('sMsg'); if(sm) sm.textContent='唯讀模式，改不了';
    } else {
      // 送審中／已通過的件，學員不能改（審核模式除外）
      (p.items||[]).forEach(function(it){
        if(!locked(it)) return;
        var box=document.getElementById('it-'+it.id);
        if(box) box.querySelectorAll('input,select,textarea').forEach(function(x){ x.disabled=true; });
      });
    }
    document.getElementById('closeX').addEventListener('click', closeSheet);
    document.getElementById('doneBtn').addEventListener('click', onDone);
    var pw=document.getElementById('pwBtn'); if(pw) pw.addEventListener('click', function(){ changePass(); });
    document.getElementById('back').addEventListener('mousedown', function(e){
      if(e.target && e.target.id==='back') closeSheet();
    });
    var ai=document.getElementById('addItem');
    if(ai) ai.addEventListener('click', function(){
      var pp=find(this.getAttribute('data-id')); if(!pp) return;
      var it=newItem(); pp.items.push(it); touch(); openSheet(pp.id, it.id);
    });
    var target = focusItemId
      ? document.querySelector('#layer [data-item="'+focusItemId+'"][data-f="topic"]')
      : document.querySelector('#layer [data-f="name"]');
    if(target && !target.disabled){
      try{ target.focus(); }catch(e){}
      if(focusItemId){ var box=document.getElementById('it-'+focusItemId);
        if(box) box.scrollIntoView({block:'center'}); }
    }
  }
  function closeSheet(){ openId=null; document.getElementById('layer').innerHTML=''; render(); }
  document.addEventListener('keydown', function(e){ if(e.key==='Escape'&&openId) closeSheet(); });

  function onDone(){
    var b=this;
    if(!canEdit() || !dirty){ closeSheet(); return; }
    b.disabled=true; b.textContent='存檔中…';
    saveNow(function(ok,message,cls){
      if(ok){ closeSheet(); return; }
      b.disabled=false; b.textContent='完成並存檔';
      var sm=document.getElementById('sMsg');
      if(sm){ sm.textContent=message; sm.className='note '+(cls||'warn'); }
    });
  }

  function refreshItem(pid,iid){
    var p=find(pid); if(!p) return;
    var it=findItem(p,iid); if(!it) return;
    var cb=document.querySelector('[data-calc="'+iid+'"]'); if(cb) cb.innerHTML=calcHtml(it);
    var pl=document.querySelector('[data-ipill="'+iid+'"]');
    if(pl){ pl.className='pill st'+(it.status||0); pl.textContent=STATUS[it.status||0]; }
    var top=document.getElementById('perTop');
    if(top){ var sess=top.querySelector('div'); var keep=sess?sess.outerHTML:'';
      top.innerHTML=sumHtml(p)+keep; }
  }

  /* ─────────── 事件 ─────────── */
  document.addEventListener('change', function(e){
    var t=e.target; if(!t.getAttribute) return;
    var pid=t.getAttribute('data-id'), iid=t.getAttribute('data-item');
    if(!pid||!iid) return;
    var p=find(pid); if(!p) return;
    var it=findItem(p,iid); if(!it) return;
    if(t.hasAttribute('data-crit')){
      var k=parseInt(t.getAttribute('data-crit'),10);
      if(!Array.isArray(it.crit)) it.crit=[false,false,false,false];
      it.crit[k]=t.checked; touch();
      var box=document.querySelector('[data-crit-box="'+iid+'"]');
      if(box) box.innerHTML=critHtml(p,it);
    } else if(t.hasAttribute('data-noblk')){
      it.noBlocker=t.checked;
      if(t.checked) it.blocker='';
      touch();
      var bb=document.querySelector('[data-blk-box="'+iid+'"]');
      if(bb) bb.innerHTML=blkHtml(p,it);
    }
  });

  document.addEventListener('input', function(e){
    var t=e.target; if(!t.getAttribute) return;
    var pid=t.getAttribute('data-id');
    // 分析四格
    var ak=t.getAttribute('data-ana');
    if(pid && ak){
      var pa=find(pid); if(!pa) return;
      var ia=findItem(pa, t.getAttribute('data-item')); if(!ia) return;
      if(!ia.ana) ia.ana={b:'',t:'',w:'',n:''};
      ia.ana[ak]=t.value; touch();
      // 只重畫下方的組合句，不重畫輸入框（避免游標跳走）
      var box=document.querySelector('[data-ana-box="'+ia.id+'"]');
      if(box){
        var old=box.querySelector('.anaout, .anamiss');
        var tmp=document.createElement('div');
        tmp.innerHTML=anaHtml(pa,ia);
        var neu=tmp.querySelector('.anaout, .anamiss');
        if(old&&neu) old.replaceWith(neu);
      }
      var hd=document.querySelector('[data-rvpill="'+ia.id+'"]');
      if(hd){
        var flag=hd.parentNode.querySelector('.anaflag');
        if(anaFilled(ia)===4 && !flag){
          var sp=document.createElement('span'); sp.className='anaflag'; sp.textContent='分析 ✓';
          hd.after(sp);
        } else if(anaFilled(ia)!==4 && flag){ flag.remove(); }
      }
      var kp=document.querySelector('.total'); if(kp) kp.outerHTML=totalHtml();
      return;
    }
    var f=t.getAttribute('data-f');
    if(!pid||!f) return;
    var p=find(pid); if(!p) return;
    var iid=t.getAttribute('data-item');
    if(iid){
      var it=findItem(p,iid); if(!it) return;
      it[f]=(f==='status')?(parseInt(t.value,10)||0):t.value;
      touch(); refreshItem(pid,iid);
    } else {
      p[f]=t.value; touch();
    }
  });

  document.addEventListener('click', function(e){
    var t=e.target && e.target.closest ? e.target.closest('[data-open],[data-sess],[data-del],[data-delitem],[data-submit],[data-approve],[data-reject],[data-withdraw],[data-unapprove],[data-torv]') : null;
    if(!t) return;
    if(t.hasAttribute('data-open')){
      var pid=t.getAttribute('data-open');
      if(admin || (me && me.code===pid)) openSheet(pid);
      else askPass(pid, '');
    }
    else if(t.hasAttribute('data-torv')){ enterReview(); }
    else if(t.hasAttribute('data-sess')){
      if(!reviewMode) return;           // 四堂進度只有審核模式能改
      var p=find(t.getAttribute('data-sess')); if(!p) return;
      var k=parseInt(t.getAttribute('data-k'),10);
      act('setSess',{code:p.id, index:k}, p.id);
    }
    else if(t.hasAttribute('data-submit')||t.hasAttribute('data-approve')||
            t.hasAttribute('data-reject')||t.hasAttribute('data-withdraw')||
            t.hasAttribute('data-unapprove')){
      var pp=find(t.getAttribute('data-id')); if(!pp) return;
      var ii=findItem(pp,t.getAttribute('data-item')); if(!ii) return;
      if(t.hasAttribute('data-submit')){
        if(!ii.topic || String(ii.topic).trim()===''){
          say('還不能送審','先填「題目」那一格，Eason 才知道你要做哪一件事。'); return; }
        act('submit',{itemId:ii.id}, pp.id);
      } else if(t.hasAttribute('data-approve')){
        act('review',{itemId:ii.id, verdict:'approve'}, pp.id);
      } else if(t.hasAttribute('data-reject')){
        askReject(pp, ii, '');
      } else if(t.hasAttribute('data-withdraw')){
        act('withdraw',{itemId:ii.id}, pp.id);
      } else if(t.hasAttribute('data-unapprove')){
        act('review',{itemId:ii.id, verdict:'unapprove'}, pp.id);
      }
      return;
    }
    else if(t.hasAttribute('data-delitem')){
      var p2=find(t.getAttribute('data-id')); if(!p2) return;
      var iid=t.getAttribute('data-delitem'), it=findItem(p2,iid); if(!it) return;
      if(p2.items.length<=1) return;
      ask({title:'移除「'+(it.topic||'這件事')+'」？',
           desc:'這件事填過的時間帳、分析、審核紀錄都會不見，<strong>而且沒辦法復原</strong>。',
           ok:'移除', danger:true}, function(v){
        if(!v) return;
        p2.items=p2.items.filter(function(x){ return x.id!==iid; });
        touch(); openSheet(p2.id);
      });
    }
    else if(t.hasAttribute('data-del')){
      var id=t.getAttribute('data-del'), p3=find(id); if(!p3) return;
      ask({title:'移除「'+(p3.name||'這位學員')+'」？',
           desc:'他填的每一件事、時間帳、分析、四堂進度全部會不見，<strong>而且沒辦法復原</strong>。',
           ok:'移除', danger:true}, function(v){
        if(!v) return;
        S.people=S.people.filter(function(x){ return x.id!==id; });
        touch(); closeSheet();
      });
    }
  });

  function onAdd(){}

  /* ─────────── 存檔 ─────────── */
  /* ─────────── API（GitHub Pages 前端 → Apps Script 後端） ─────────── */
  var API = window.AI_SEED_API || '';
  var me = null;        // 學員登入後：{code, name, pass}
  var admin = null;     // Eason 的審核通行碼

  function api(action, extra){
    if(!API) return Promise.reject({error:'還沒設定後端網址（js/config.js）'});
    var body = {action: action};
    if(me){ body.code = me.code; body.pass = me.pass; }
    if(admin) body.admin = admin;
    for(var k in extra) if(Object.prototype.hasOwnProperty.call(extra,k)) body[k]=extra[k];
    return fetch(API, {method:'POST', headers:{'Content-Type':'text/plain'},
                       body: JSON.stringify(body)})
      .then(function(r){ return r.json(); })
      .then(function(d){ if(!d.ok) throw d; return d; });
  }

  function act(action, extra, reopen){
    var box=document.getElementById('sMsg')||document.getElementById('msg');
    if(box) box.textContent='處理中…';
    api(action, extra).then(function(d){
      S={people:d.people||[], rev:(S.rev||0)+1}; dirty=false; migrate(); render();
      if(reopen) openSheet(reopen);
    }).catch(function(e){
      say('沒有成功',(e&&e.error)||'再試一次，或先重新整理看看資料是不是被別人改過了。');
    });
  }

  function pull(cb){
    api('getAll').then(function(d){
      S = {people: d.people||[], rev:(S.rev||0)+1};
      dirty=false; migrate(); render(); if(cb) cb(true);
    }).catch(function(e){
      msg((e&&e.error)||'讀不到資料，檢查網路','warn'); if(cb) cb(false);
    });
  }

  function saveNow(cb){
    if(saving){ cb(false,'存檔中，等一下','warn'); return; }
    if(!me && !admin){ cb(false,'先按右上「我要填我的」登入','warn'); return; }
    if(!openId){ cb(false,'沒有開啟中的人','warn'); return; }
    var p=find(openId);
    if(!p){ cb(false,'找不到這個人','warn'); return; }
    if(me && me.code!==p.id){ cb(false,'你只能改自己那一張','warn'); return; }
    saving=true;
    var jobs=p.items.map(function(it){ return api('saveItem',{item:it}); });
    Promise.all(jobs).then(function(res){
      saving=false; dirty=false;
      var last=res[res.length-1];
      if(last&&last.people){ S={people:last.people, rev:(S.rev||0)+1}; migrate(); render(); openSheet(p.id); }
      cb(true,'已存檔，其他人重新整理就看得到','ok');
    }).catch(function(e){
      saving=false; cb(false,(e&&e.error)||'存檔失敗，再按一次','warn');
    });
  }

  function onSave(){
    var btn=document.getElementById('save');
    if(saving) return;
    btn.disabled=true; msg('存檔中…','');
    saveNow(function(ok,message,cls){ btn.disabled=false; msg(message,cls); });
  }

  function applyReadOnly(){
    var b=document.getElementById('save'); if(b) b.disabled=true;
    var a=document.getElementById('add'); if(a) a.disabled=true;
    var box=document.getElementById('roBox');
    if(box) box.innerHTML='<div class="ro"><strong>要填自己那一張，直接點你自己的卡片。</strong><br>'+
      '會跳出來問密碼——<strong>第一次用的是預設的 0000</strong>，進去之後按「改密碼」換掉。<br>'+
      '別人的卡片點開只能看，改不了。</div>';
  }

  window.addEventListener('beforeunload', function(e){ if(dirty){ e.preventDefault(); e.returnValue=''; } });

  render();

  function boot(){
    render();
    pull(function(ok){
      if(ok && !S.people.length) say('名冊是空的','Eason 還沒把 16 個人匯進試算表。');
    });
  }
  boot();
})();
