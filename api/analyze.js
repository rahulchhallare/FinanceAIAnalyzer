// Vercel serverless function: collects web evidence (Firecrawl) and analyzes it (Claude).
// Env vars: ANTHROPIC_API_KEY (required), FIRECRAWL_API_KEY (recommended), ANTHROPIC_MODEL (optional)
const QUERIES=["annual financial results revenue operating profit net profit","net debt borrowings liquidity cash flow interest cover","credit rating Moody's S&P Fitch outlook","latest news trading statement risk litigation regulatory","results highlights key ratios return on equity"];

async function fcSearch(q,key){
  const body=JSON.stringify({query:q,limit:4});
  const h={"Content-Type":"application/json",Authorization:"Bearer "+key};
  let r=await fetch("https://api.firecrawl.dev/v2/search",{method:"POST",headers:h,body});
  if(r.status===404)r=await fetch("https://api.firecrawl.dev/v1/search",{method:"POST",headers:h,body});
  if(!r.ok){let m="";try{m=(await r.text()).slice(0,100)}catch(e){}throw new Error("Firecrawl error "+r.status+(m?": "+m:""))}
  const j=await r.json();
  return Array.isArray(j.data)?j.data:((j.data&&j.data.web)||[]);
}

function prompt(name,country,ev,extra){
  const src=ev.map((e,i)=>`[${i+1}] ${e.title} (${e.url})\n${e.text}`).join("\n\n");
  return `You are a financial analyst explaining how a company is doing financially. Today is ${new Date().toDateString()}. Company: "${name}"${country?` (${country})`:""}.
${ev.length?`Below is evidence collected from the web. Base every figure on it wherever possible. Prefer the most recent period. If it lacks a figure, compute it from statements where you can (mark it as estimated), else use your own reliable knowledge (mark estimated), else null.\n\nEVIDENCE:\n${src}`:"No web evidence could be collected. Use only figures you reliably know and state this in data_caveat."}
${extra?`\nUSER-PROVIDED DATA (highest priority):\n${extra}\n`:""}
Return ONLY a JSON object, no markdown:
{"company":"official name","institution_type":"corporate|bank|insurer","ticker":"or null","currency":"e.g. ZAR","period":"latest fiscal period used","found":true/false,
"revenue":"human readable","net_income":"human readable","net_debt":"human readable or null","credit_rating":"agency ratings if evidenced, else null",
"revenue_growth_pct":n|null,"operating_margin_pct":n|null,"net_margin_pct":n|null,"roe_pct":n|null,"net_debt_to_ebitda":n|null,"debt_to_equity":n|null,"current_ratio":n|null,"interest_coverage":n|null,"free_cash_flow_positive":true|false|null,
"cost_to_income_pct":n|null,"credit_loss_ratio_bps":n|null,"cet1_ratio_pct":n|null,"npl_ratio_pct":n|null,"liquidity_coverage_ratio_pct":n|null,"earnings_growth_pct":n|null,"total_assets":"human readable or null",
"estimated":["metric keys you computed or estimated rather than read directly"],
"distress_signals":true|false (true only if evidence shows going-concern doubt, default, business rescue, debt restructuring or similar),
"summary":"4-5 sentence plain-English financial summary for a business reader","insights":["4-5 specific insights with figures"],"risks":["3-5 risks or red flags"],
"sources_used":[evidence numbers you relied on],"confidence":"high|medium|low","data_caveat":"one sentence on freshness, gaps, entity ambiguity"}
Never invent numbers. Use IFRS-style definitions; note if lease liabilities are included in debt in data_caveat. If the company is a bank, set institution_type "bank", fill the bank fields (credit loss ratio in basis points, ratios in percent, earnings_growth_pct from headline or net earnings) and leave the corporate-only fields null. Label a ratio only when the evidence or standard bank reporting makes its meaning clear. If it is an insurer set "insurer" and leave metrics null.`}

module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({error:"Use POST"});
  const {name,country,extra,code}=req.body||{};
  const AC=process.env.ACCESS_CODE;
  if(!AC)return res.status(500).json({error:"Server is missing ACCESS_CODE. Add it in Vercel environment variables and redeploy."});
  const a=Buffer.from(String(code||"")),b=Buffer.from(AC);
  if(a.length!==b.length||!require("crypto").timingSafeEqual(a,b))return res.status(401).json({error:"Wrong or missing access code."});
  if(!name||typeof name!=="string"||name.length>100)return res.status(400).json({error:"Enter a company name (max 100 characters)."});
  const AK=process.env.ANTHROPIC_API_KEY,FK=process.env.FIRECRAWL_API_KEY;
  if(!AK)return res.status(500).json({error:"Server is missing ANTHROPIC_API_KEY."});
  const co=name.trim(),ctry=typeof country==="string"?country.slice(0,40):"",ex=typeof extra==="string"?extra.slice(0,20000):"";
  const n=co+(ctry?" "+ctry:"");
  let ev=[],live=false;const diag=[];
  if(!FK)diag.push("FIRECRAWL_API_KEY is not set in Vercel");
  if(FK){
    const rs=await Promise.allSettled(QUERIES.map(q=>fcSearch(n+" "+q,FK)));
    const seen=new Set();let ok=0;
    rs.forEach(r=>{if(r.status!=="fulfilled"){const m=String((r.reason&&r.reason.message)||r.reason);if(!diag.includes(m))diag.push(m);return}ok++;r.value.forEach(w=>{if(w.url&&!seen.has(w.url)){seen.add(w.url);ev.push({url:w.url,title:w.title||w.url,text:String(w.description||w.markdown||"").slice(0,3000)})}})});
    live=ok>0&&ev.length>0;if(ok>0&&!ev.length)diag.push("Firecrawl returned no results");
  }
  if(!live&&!ex.trim())return res.status(200).json({unavailable:true,diag:diag.length?diag.slice(0,3):["No sources could be collected"],ev:[],live:false});
  try{
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
      headers:{"content-type":"application/json","x-api-key":AK,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||"claude-sonnet-5-5",max_tokens:3000,messages:[{role:"user",content:prompt(co,ctry,ev,ex)}]})});
    const j=await r.json();
    if(!r.ok)return res.status(502).json({error:"AI error: "+((j.error&&j.error.message)||r.status)});
    const txt=(j.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");
    const data=JSON.parse(txt.slice(txt.indexOf("{"),txt.lastIndexOf("}")+1));
    return res.status(200).json({data,ev,live,diag:diag.slice(0,3)});
  }catch(e){return res.status(502).json({error:"Could not parse the AI response. Try again."})}
};
