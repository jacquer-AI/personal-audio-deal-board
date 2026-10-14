import asyncio, json, re, subprocess
from pathlib import Path
import edge_tts

READINGS=[
 ("07_1050_schizofrenia_objawy_Cierpialkowska_omowienie","study-audio/saturday-required/07_schizofrenia_rozdzial9_omowienie.txt"),
 ("08_1340_agresja_Kmieciak_2016_omowienie","study-audio/saturday-required/08_kmieciak_2016_omowienie.txt"),
 ("09_1340_zlosc_Norcross_Kobayashi_1999_omowienie","study-audio/saturday-required/09_norcross_kobayashi_1999_omowienie.txt"),
]
OUTPUT=Path("out_saturday_required"); OUTPUT.mkdir(exist_ok=True)
def chunks(text,maximum=1700):
 text=re.sub(r"\s+"," ",text).strip()
 sentences=re.split(r"(?<=[.!?])\s+",text)
 result=[];block=""
 for line in sentences:
  for frag in ([line] if len(line)<maximum else [line[i:i+maximum] for i in range(0,len(line),maximum)]):
   if len(block)+len(frag)>maximum and block:
    result.append(block.strip());block=""
   block+=(" " if block else "")+frag
 if block:result.append(block.strip())
 return result

async def synth(name,path):
 text=Path(path).read_text(encoding="utf-8")
 assert 9000<=len(text)<=24000,(name,len(text))
 parts=chunks(text)
 tmp=OUTPUT/(name+"_chunks");tmp.mkdir(exist_ok=True)
 print("START",name,"chars",len(text),"parts",len(parts),flush=True)
 for i,part in enumerate(parts):
  file=tmp/f"{i:04}.mp3"
  if file.exists() and file.stat().st_size>1000:continue
  for j in range(5):
   try:
    await edge_tts.Communicate(part,voice="pl-PL-ZofiaNeural",rate="-8%").save(str(file))
    assert file.stat().st_size>1500
    break
   except Exception as err:
    file.unlink(missing_ok=True)
    if j==4:raise
    print("RETRY",name,i,j,str(err)[:100],flush=True)
    await asyncio.sleep(4*(j+1))
  if (i+1)%4==0 or i+1==len(parts):print("PROGRESS",name,i+1,len(parts),flush=True)
  await asyncio.sleep(.4)
 concat=tmp/"list.txt"
 concat.write_text("".join("file '"+p.name+"'\n" for p in sorted(tmp.glob("????.mp3"))),encoding="utf-8")
 out=OUTPUT/(name+"_ZofiaNeural.mp3")
 subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i",str(concat),"-c","copy",str(out)],check=True)
 assert out.stat().st_size>800000
 print("DONE",name,out.stat().st_size,flush=True)

async def main():
 for name,path in READINGS: await synth(name,path)
 subprocess.run(["ffprobe","-v","error","-show_format","-of","json",str(list(OUTPUT.glob("*Norcross*.mp3"))[0])],check=True)
asyncio.run(main())
