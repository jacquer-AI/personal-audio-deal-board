import asyncio, re, json, subprocess, urllib.request, time, sys
from pathlib import Path
import pymupdf
import edge_tts

FILES=[
  ("01_zaawansowana_diagnoza_kliniczna","study-audio/course-notes/01_diagnoza_kliniczna.txt"),
  ("02_dorosli_motywacja_do_zmiany","study-audio/course-notes/02_dorosli_motywacja.txt"),
  ("03_dorosli_agresja_i_manipulacja","study-audio/course-notes/03_dorosli_agresja_i_manipulacja.txt")
]
URL="https://www.psychiatriapolska.pl/pdf-58228-79300?filename=Taktyki-manipulacji-pacje.pdf"
OUT=Path("out_audio");OUT.mkdir(exist_ok=True)

def clean(s):
  s=s.replace("\u00ad","").replace("\xa0"," ").replace("\u200b"," ")
  s=re.sub(r"(?<=\w)[-‐]\s*\n\s*(?=\w)","",s)
  s=re.sub(r"(?m)^\s*(?:6[5-9]|7[0-6])\s*$","",s)
  s=re.sub(r"(?m)^\s*(?:Taktyki manipulacji pacjentów z zaburzeniami nerwicowymi w życiu codziennym|Eugenia Mandal, Adam Horak)\s*$","",s)
  s=re.sub(r"\[\s*\d+(?:\s*[,;]\s*\d+)*\s*\]","",s)
  s=re.sub(r"(?<!\n)\n(?!\n)"," ",s)
  s=re.sub(r"\n+"," \n\n",s)
  s=re.sub(r"[ \t]{2,}"," ",s)
  for a,b in [
    ("ICD-10","I C D dziesięć"),("ICD-11","I C D jedenaście"),
    ("DSM-5","D S M pięć"),("MACH-IV","skala makiawelizmu"),
    ("α","alfa "),(" β "," beta "),("χ²","chi kwadrat")
  ]:s=s.replace(a,b)
  return s.strip()

def extract_mandal():
  print("Retrieving publisher PDF (published open access)",flush=True)
  req=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0"})
  with urllib.request.urlopen(req,timeout=75) as x:
    body=x.read()
  assert body.startswith(b"%PDF") and len(body)>50_000
  doc=pymupdf.open(stream=body,filetype="pdf")
  assert len(doc)==12
  txt="\n".join(p.get_text("text",sort=True) for p in doc)
  s=re.search(r"(?mi)^\s*Wstęp\s*$",txt)
  e=re.search(r"(?mi)^\s*(Piśmiennictwo|Literatura)\s*$",txt)
  assert s and e and e.start()>s.start(),("section markers",str(s),str(e))
  content=clean(txt[s.end():e.start()])
  assert 11000<len(content)<48000,len(content)
  intro=("Artykuł obowiązkowy. Eugenia Mandal i Adam Horak, rok dwa tysiące szesnasty. "
         "Taktyki manipulacji pacjentów z zaburzeniami nerwicowymi w życiu codziennym i podczas terapii. "
         "Psychiatria Polska, tom pięćdziesiąty, zeszyt pierwszy. "
         "Nagranie obejmuje główną polską treść bez angielskiego streszczenia i bibliografii. ")
  return intro+content

def split_sentences(s, max_chars=1950):
  out=[];a=""
  for sent in re.split(r"(?<=[.!?])\s+",s):
    for seg in ([sent] if len(sent)<=max_chars else [sent[k:k+max_chars] for k in range(0,len(sent),max_chars)]):
      if a and len(a)+len(seg)>max_chars:out.append(a.strip());a=""
      a+=(" " if a else "")+seg
  if a:out.append(a.strip())
  return out

async def synth(name,text):
  folder=OUT/name;folder.mkdir(exist_ok=True)
  arr=split_sentences(clean(text))
  (OUT/f"{name}_tekst_do_czytania.txt").write_text(text,encoding="utf-8")
  print(f"START {name}: {len(text)} characters, {len(arr)} chunks",flush=True)
  for i,item in enumerate(arr,1):
    path=folder/f"{i:03d}.mp3"
    if path.exists() and path.stat().st_size>1000:continue
    for attempt in range(4):
      try:
        await edge_tts.Communicate(item,voice="pl-PL-ZofiaNeural",rate="-6%").save(str(path))
        if path.stat().st_size<1800:raise ValueError("Audio chunk too small")
        break
      except Exception as e:
        path.unlink(missing_ok=True)
        print(f"Retry {name} {i} of {len(arr)} attempt {attempt+1}: {e}",flush=True)
        if attempt==3:raise
        await asyncio.sleep(6*(attempt+1))
    if i%3==0 or i==len(arr): print(f"{name}: {i}/{len(arr)}",flush=True)
    await asyncio.sleep(0.45)
  concat=folder/"concat.txt"
  concat.write_text("".join("file '"+p.name+"'\n" for p in sorted(folder.glob("???.mp3"))))
  out=OUT/f"{name}_ZofiaNeural.mp3"
  subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","concat","-safe","0","-i",str(concat),"-c","copy",str(out)],check=True)
  assert out.stat().st_size>350000
  probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration,size","-of","json",str(out)]))
  (OUT/f"{name}_parametry.json").write_text(json.dumps(probe,indent=2))
  print("DONE",name,probe,flush=True)

async def main():
  for name,path in FILES:
    text=Path(path).read_text(encoding="utf-8")
    assert len(text)>=4500
    await synth(name,text)
  await synth("04_Mandal_Horak_2016_pelny_artykul",extract_mandal())

asyncio.run(main())
