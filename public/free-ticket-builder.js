(function(){
  var lastPicks=null,lastOddsData=null,lastTarget=5,lastMinOdds=1.20,lastTicket=null;
  var API_BASE=window.WFT_API||'https://winfulltime-api.onrender.com';
  var PRO_URL=(window.WFT_FREE_BUILDER&&window.WFT_FREE_BUILDER.proUrl)||'/ticket-builder.html';

  function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

  function normaliseTeam(v){return String(v||'').toLowerCase().replace(/\b(fc|afc|cf|the)\b/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim()}
  function matchIdentity(v){var teams=String(v||'').split(/\s+(?:-|vs)\s+/i).map(normaliseTeam).filter(Boolean);return teams.length===2?teams.sort().join('|'):normaliseTeam(v)}
  function matchPairKey(v){var teams=String(v||'').split(/\s+(?:-|vs)\s+/i).map(normaliseTeam);return teams.length===2?teams[0]+'|'+teams[1]:null}

  function lagosNowString(){
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date());
    function get(t){var f=parts.find(function(p){return p.type===t});return f?f.value:'00'}
    var hh=get('hour')==='24'?'00':get('hour');
    return get('year')+'-'+get('month')+'-'+get('day')+' '+hh+':'+get('minute');
  }
  function hasKickedOff(dateStr,timeStr){
    if(!dateStr||!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))return false;
    var t=String(timeStr||'').trim();if(!/^\d{1,2}:\d{2}$/.test(t))return false;
    var bits=t.split(':');
    var kickoff=dateStr+' '+(bits[0].length===1?'0'+bits[0]:bits[0])+':'+bits[1];
    return kickoff<lagosNowString();
  }

  var BC_ALLOWED={'1X2':['1','X','2'],'Double Chance':['1X','X2','12'],'Over 1.5':['Over 1.5'],'Over 2.5':['Over 2.5']};
  function bookingCodeEligible(category,tip){
    var allowed=BC_ALLOWED[category];if(!allowed)return false;
    return allowed.indexOf(String(tip||'').trim())!==-1;
  }
  function mapCat(category){
    if(category==='1X2'||category==='Double Chance')return '1x2';
    if(category==='Over 1.5')return 'over15';
    if(category==='Over 2.5')return 'over25';
    return String(category||'').toLowerCase();
  }

  function shuffleArray(arr){for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=arr[i];arr[i]=arr[j];arr[j]=t}return arr}

  function findLiveOdd(matchName,category,tip){
    if(!lastOddsData||!lastOddsData.available||!Array.isArray(lastOddsData.response))return null;
    var teams=String(matchName||'').split(/\s+-\s+/);
    if(teams.length!==2)return null;
    var home=normaliseTeam(teams[0]),away=normaliseTeam(teams[1]);
    var fixture=lastOddsData.response.find(function(item){
      return normaliseTeam(item.teams&&item.teams.home&&item.teams.home.name)===home&&normaliseTeam(item.teams&&item.teams.away&&item.teams.away.name)===away});
    if(!fixture)return null;
    var tipValue=String(tip||'').trim(),marketNames=[],acceptableValues=[];
    if(category==='1X2'){marketNames=['match winner'];if(tipValue==='1')acceptableValues=['1','home',teams[0]];if(tipValue==='X')acceptableValues=['x','draw'];if(tipValue==='2')acceptableValues=['2','away',teams[1]]}
    else if(category==='Double Chance'){marketNames=['double chance'];if(tipValue==='1X')acceptableValues=['1x','home/draw','home or draw'];if(tipValue==='X2')acceptableValues=['x2','away/draw','away or draw'];if(tipValue==='12')acceptableValues=['12','home/away','home or away']}
    else if(/^Over\s+[0-9.]+$/i.test(tipValue)||/^Under\s+[0-9.]+$/i.test(tipValue)){marketNames=['goals over/under','over/under'];acceptableValues=[tipValue]}
    else if(category==='BTTS YES'||category==='BTTS NO'){marketNames=['both teams score','both teams to score'];acceptableValues=[category==='BTTS YES'?'yes':'no']}
    else return null;
    var bookmakers=Array.isArray(fixture.bookmakers)?fixture.bookmakers:[];
    for(var b=0;b<bookmakers.length;b++){var bets=Array.isArray(bookmakers[b].bets)?bookmakers[b].bets:[];for(var bt=0;bt<bets.length;bt++){if(!marketNames.includes(String(bets[bt].name||'').toLowerCase()))continue;var vals=Array.isArray(bets[bt].values)?bets[bt].values:[];for(var vi=0;vi<vals.length;vi++){if(acceptableValues.some(function(a){return normaliseTeam(vals[vi].value)===normaliseTeam(a)})){var odds=Number.parseFloat(vals[vi].odd);if(Number.isFinite(odds)&&odds>1)return{odds:Number(odds.toFixed(2)),bookmaker:bookmakers[b].name||'API-Football'}}}}}
    return null;
  }

  function renderTicket(best,totalOdds,staleNote,bookingCodeMode){
    lastTicket=best;
    var legs=best.map(function(s,i){
      return '<div class="htb-leg"><strong>'+(i+1)+'. '+esc(s.match)+'</strong> <span class="htb-tip">'+esc(s.tip)+'</span><br><span style="font-size:11px;color:rgba(232,237,245,.45)">'+esc(s.league)+' | '+esc(s.category)+' | '+s.odds.toFixed(2)+'</span></div>'
    }).join('');
    var staleHtml=staleNote?'<div class="htb-stale">'+esc(staleNote)+'</div>':'';
    var betwayOk=best.every(function(s){return String(s.category||'').toLowerCase()==='1x2'&&/^[1X2]$/.test(String(s.tip||'').trim())});
    var codeHtml=bookingCodeMode?
      '<div class="htb-actions"><button class="code-btn sportybet" data-code="sportybet">SportyBet Code</button>'+(betwayOk?'<button class="code-btn betway" data-code="betway">Betway Code</button><button class="code-btn betpawa" data-code="betpawa">betPawa Code</button>':'')+'</div><div class="code-display" id="htbCodeDisplay"></div>':'';
    return '<div class="htb-ticket"><div class="htb-ticket-head"><span class="htb-ticket-label">'+best.length+'-Leg Accumulator</span><span class="htb-ticket-odds">'+totalOdds.toFixed(2)+' odds</span></div>'+legs+staleHtml+codeHtml+'<a href="'+PRO_URL+'" class="htb-full">Want higher odds? Try the full Ticket Builder &rarr;</a></div>';
  }

  function buildTicket(picks,target,shuffle){
    if(shuffle)picks=shuffleArray(picks.slice());
    else picks=picks.slice();
    picks.forEach(function(p){p._fitJitter=shuffle?Math.random()*0.15:0});
    picks.sort(function(a,b){
      var aFit=Infinity,bFit=Infinity;
      for(var lc=2;lc<=8;lc++){aFit=Math.min(aFit,Math.abs(Math.log(a.odds)-Math.log(target)/lc));bFit=Math.min(bFit,Math.abs(Math.log(b.odds)-Math.log(target)/lc))}
      return (aFit+(a._fitJitter||0))-(bFit+(b._fitJitter||0))||b.prob-a.prob});
    var best=[];var used=new Set();
    var minOdds=target*0.8,maxOdds=target*1.2;
    for(var i=0;i<picks.length&&best.length<3;i++){
      var p=picks[i];var mid=matchIdentity(p.match);
      if(used.has(mid))continue;used.add(mid);
      var tentative=best.concat([p]);var prod=tentative.reduce(function(t,s){return t*s.odds},1);
      if(prod>maxOdds)break;
      best.push(p);
      if(prod>=minOdds)break;
    }
    if(!best.length)return null;
    var totalOdds=best.reduce(function(t,s){return t*s.odds},1);
    return{best:best,totalOdds:totalOdds};
  }

  async function generate(shuffle){
    var target=parseFloat(document.getElementById('htbTarget').value);
    var minO=parseFloat(document.getElementById('htbMin').value);
    var maxO=parseFloat(document.getElementById('htbMax').value);
    var todayOnly=document.getElementById('htbToday').checked;
    var bookingCodeMode=document.getElementById('htbCode').checked;
    var res=document.getElementById('htbResult');
    var shuffleBtn=document.getElementById('htbShuffle');
    if(!Number.isFinite(target)||target<=1||!Number.isFinite(minO)||minO<=1||!Number.isFinite(maxO)||maxO<minO){res.innerHTML='<div class="htb-empty">Enter valid odds values.</div>';return}
    if(target>5){res.innerHTML='<div class="htb-empty">For targets above 5 odds, use the <a href="'+PRO_URL+'" class="htb-full">full Ticket Builder</a>.</div>';return}
    res.innerHTML='<div class="htb-loading"><div class="htb-spinner"></div><div class="htb-loading-text">Building ticket...</div></div>';
    try{
      var r=await fetch('/data/predictions.json',{cache:'no-store'});
      if(!r.ok)throw new Error('Failed to load');
      var data=await r.json();
      var feedKeys=null;
      if(bookingCodeMode){
        try{var fm=await fetch(API_BASE+'/api/converter/available-matches',{cache:'no-store'});if(fm.ok){var feed=await fm.json();feedKeys=new Set((feed.matches||[]).map(function(x){return normaliseTeam(x.home)+'|'+normaliseTeam(x.away)}))}}catch(e){}
        if(!feedKeys){res.innerHTML='<div class="htb-empty">Could not load eligible matches. <a href="'+PRO_URL+'" class="htb-full">Try the full Ticket Builder</a></div>';return}
      }
      var today=new Date().toISOString().split('T')[0];
      var staleNote=null;
      if(!todayOnly&&data.date&&data.date!==today){staleNote='Showing predictions from '+data.date+'. Today\'s data is not yet available.'}
      var dataDate=data.date||'';
      try{var oRes=await fetch(API_BASE+'/api/football-odds?date='+encodeURIComponent(dataDate||today),{cache:'no-store'});lastOddsData=oRes.ok?await oRes.json():null}catch(e){lastOddsData=null}
      if(bookingCodeMode){
        var bcCore=window.WFTTicketBuilder;
        if(!bcCore){res.innerHTML='<div class="htb-empty">Booking code engine is still loading. Please refresh the page.</div>';shuffleBtn.disabled=true;return}
        var bcRes=bcCore.build(data,{
          date:bcCore.watDate(),
          oddsResponse:lastOddsData&&Array.isArray(lastOddsData.response)?lastOddsData.response:null,
          markets:null,
          safeOnly:false,
          bookingCodeMode:true,
          availableMatches:feed&&Array.isArray(feed.matches)?feed.matches:null,
          numLegs:3,
          maxOdds:100,
          minOddsPerLeg:minO,
          maxOddsPerLeg:maxO,
          targetOdds:target,
          shuffle:shuffle,
          unbeatenData:null
        });
        if(!bcRes.available||!bcRes.ticket||!bcRes.ticket.selections||bcRes.ticket.selections.length<2){
          var fbRes=bcCore.buildFromSchedule(feed&&Array.isArray(feed.matches)?feed.matches:null,{
            date:bcCore.watDate(),
            targetOdds:target,
            numLegs:3,
            minOddsPerLeg:1.05,
            maxOddsPerLeg:maxO,
            maxOdds:100,
            shuffle:shuffle,
            predictions:data,
            minProbability:0.55
          });
          if(fbRes.available&&fbRes.ticket&&fbRes.ticket.selections&&fbRes.ticket.selections.length>=2){
            res.innerHTML=renderTicket(fbRes.ticket.selections,fbRes.ticket.totalOdds,staleNote,true);
            lastPicks=fbRes.ticket.selections;
            shuffleBtn.disabled=false;
            return;
          }
          res.innerHTML='<div class="htb-empty">'+esc(fbRes.reason||bcRes.reason||'No qualifying picks for a booking code.')+' <a href="'+PRO_URL+'" class="htb-full">Try the full Ticket Builder</a></div>';
          shuffleBtn.disabled=true;
          return;
        }
        res.innerHTML=renderTicket(bcRes.ticket.selections,bcRes.ticket.totalOdds,staleNote,true);
        lastPicks=bcRes.ticket.selections;
        shuffleBtn.disabled=false;
        return;
      }
      var cats=[['matches','1X2'],['over15Matches','Over 1.5'],['over25Matches','Over 2.5'],['bttsMatches','BTTS YES'],['bttsNoMatches','BTTS NO'],['cornersMatches','Corners'],['cardsMatches','Cards'],['teamToScore2PlusMatches','To Score 2+'],['winstreakMatches','Win Streak'],['losestreakMatches','Loss Streak'],['drawstreakMatches','Draw Streak']];
      var seen=new Set();
      var picks=[];
      cats.forEach(function(c){
        (data[c[0]]||[]).forEach(function(m){
          var match=m.match||m.fixture||m.name;
          if(!match||!m.tip)return;
          if(m.result||m.score)return;
          if(todayOnly&&m.date!==today)return;
          var prob=Number(m.probability??m.confidence);
          if(!Number.isFinite(prob)||prob<40)return;
          var isDC=c[1]==='1X2'&&/^(1X|X2|12)$/.test(String(m.tip).trim());
          var cat=isDC?'Double Chance':c[1];
          if(bookingCodeMode){
            if(!bookingCodeEligible(cat,m.tip))return;
            if(hasKickedOff(m.date,m.time))return;
            if(feedKeys){var fk=matchPairKey(match);if(!fk||!feedKeys.has(fk))return}
          }
          var liveOdd=findLiveOdd(match,cat,m.tip);
          var odds=liveOdd?liveOdd.odds:Number(((100/prob)/1.05).toFixed(2));
          if(odds<minO||odds>maxO)return;
          var key=matchIdentity(match)+'|'+normaliseTeam(m.tip)+'|'+m.date;
          if(seen.has(key))return;
          seen.add(key);
          picks.push({match:match,tip:m.tip,odds:odds,prob:prob,date:m.date,time:m.time||'',league:m.league||'',category:cat,oddsSource:liveOdd?'API-Football':'Estimated'});
        });
      });
      var todayMatches=(dataDate===today);
      if(!bookingCodeMode&&!todayOnly&&!todayMatches){
        var ubRes=null;try{ubRes=await fetch('/data/h2h-unbeaten.json',{cache:'no-store'})}catch(e){}
        if(ubRes&&ubRes.ok){var ubData=await ubRes.json();var unbeatenMatches=(ubData.dates&&ubData.dates[today])||[];
          (unbeatenMatches||[]).forEach(function(m){
            if(!m.match||!m.streaks)return;
            m.streaks.forEach(function(s){
              var tipText=s.team+' or Draw';
              var ubProb=Math.min(85,Math.max(42,50+s.count*2));
              var ubOdds=Number(((100/ubProb)/1.05).toFixed(2));
              if(ubOdds<minO||ubOdds>maxO)return;
              var key=matchIdentity(m.match)+'|'+normaliseTeam(tipText)+'|'+today;
              if(seen.has(key))return;seen.add(key);
              picks.push({match:m.match,tip:tipText,odds:ubOdds,prob:ubProb,date:today,time:m.time||'',league:m.league||'',category:'Unbeaten',oddsSource:'Estimated'});
            });
          });
        }
      }
      if(!picks.length){res.innerHTML='<div class="htb-empty">No qualifying picks. <a href="'+PRO_URL+'" class="htb-full">Try the full Ticket Builder</a></div>';shuffleBtn.disabled=true;return}
      lastPicks=picks;lastTarget=target;lastMinOdds=minO;
      var result=buildTicket(picks,target,shuffle);
      if(!result){res.innerHTML='<div class="htb-empty">No valid ticket found. Try adjusting odds range. <a href="'+PRO_URL+'" class="htb-full">Try the full Ticket Builder</a></div>';shuffleBtn.disabled=true;return}
      res.innerHTML=renderTicket(result.best,result.totalOdds,staleNote,bookingCodeMode);
      shuffleBtn.disabled=false;
    }catch(e){res.innerHTML='<div class="htb-empty">Unable to load predictions. <a href="'+PRO_URL+'" class="htb-full">Try the full Ticket Builder</a></div>';shuffleBtn.disabled=true}
  }

  document.getElementById('htbGenerate').addEventListener('click',function(){generate(false)});
  document.getElementById('htbShuffle').addEventListener('click',function(){if(lastPicks)generate(true)});
  document.getElementById('htbResult').addEventListener('click',function(ev){
    var btn=ev.target.closest('.code-btn');
    if(!btn)return;
    var display=document.getElementById('htbCodeDisplay');
    if(!display)return;
    var bookmaker=btn.getAttribute('data-code');
    var BOOKMAKER_LABELS={sportybet:'SportyBet',betway:'Betway',betpawa:'betPawa'};
    btn.disabled=true;
    btn.textContent='Creating '+BOOKMAKER_LABELS[bookmaker]+' code...';
    display.style.display='none';
    var legs=(lastTicket||[]).map(function(s){return{match:s.match,tip:s.tip,category:mapCat(s.category)}});
    fetch(API_BASE+'/api/converter/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookmaker:bookmaker,legs:legs})})
      .then(function(res){return res.json().then(function(body){return{ok:res.ok,body:body}})})
      .then(function(result){
        if(result.ok&&result.body.code){display.className='code-display';display.innerHTML='<span class="cd-label">'+bookmaker+' Booking Code</span>'+esc(result.body.code)}
        else{var msg=result.body&&result.body.error?result.body.error:'Failed to create code';
          if(result.body&&result.body.detail)msg+=' — '+result.body.detail;
          display.className='code-display error';display.innerHTML='<span class="cd-label">Unable to create code</span>'+esc(msg)}
        display.style.display='block';
      })
      .catch(function(){display.className='code-display error';display.innerHTML='<span class="cd-label">Unable to create code</span>Network error';display.style.display='block'})
      .then(function(){btn.disabled=false;btn.textContent=BOOKMAKER_LABELS[bookmaker]+' Code'});
  });
})();