import asyncio, re, subprocess, urllib.request, time
from pathlib import Path
import pymupdf
import edge_tts

ARTICLES=[
 ("gaweda_2009_01_teoria", "Podstawy teoretyczne treningu metapoznawczego dla chorych na schizofrenię",
  "https://www.psychiatriapolska.pl/pdf-154281-78835?filename=78835.pdf"),
 ("gaweda_2009_02_praktyka", "Trening metapoznawczy dla chorych na schizofrenię. Opis metody i doświadczeń klinicznych",
  "https://www.psychiatriapolska.pl/pdf-154282-78836?filename=78836.pdf"),
]
OUT=Path("out_audio"); OUT.mkdir(exist_ok=True)
def prepare(raw):
    raw=raw.replace("\u00ad\n","").replace("\u00ad","").replace("\xa0"," ")
    raw=re.sub(r"(?<=\w)-\s*\n\s*(?=\w)","",raw)
    raw=re.sub(r"\n\s*\d{3}\s*\n", "\n",raw)
    raw=re.sub(r"(?m)^\s*\d{3}\s*$","",raw)
    raw=re.sub(r"\n[^\n]{0,110}Gawęda i (?:wsp|in)\.[^\n]{0,50}\n"," \n",raw)
    raw=re.sub(r"(?m)^\s*(?:Łukasz Gawęda i wsp\.|Lukasz Gaweda et al\.)\s*$","",raw)
    raw=re.sub(r"(?<!\n)\n(?!\n)"," ",raw)
    raw=re.sub(r"\n{2,}",". \n\n",raw)
    raw=re.sub(r"\s{2,}"," ",raw)
    raw=re.sub(r"\bICD[ -]?10\b", "I C D dziesięć",raw,flags=re.I)
    raw=re.sub(r"\bDSM[ -]?(?:IV|4)\b","D S M cztery",raw,flags=re.I)
    raw=re.sub(r"\bMCT\b","trening metapoznawczy",raw)
    return raw.strip()

def split_at_sentences(s,limit=2200):
    chunks=[];acc=""
    for sentence in re.split(r"(?<=[.!?])\s+",s):
        if len(sentence)>limit:
            sentences=[sentence[i:i+limit] for i in range(0,len(sentence),limit)]
        else:sentences=[sentence]
        for seg in sentences:
            if len(acc)+len(seg)+1>limit and acc:
                chunks.append(acc.strip()); acc=""
            acc+=(" " if acc else "")+seg
    if acc: chunks.append(acc.strip())
    return chunks

async def narrate(name,part):
    audio_path=OUT/name
    audio_path.mkdir(exist_ok=True)
    chapters=split_at_sentences(part)
    print(f"{name}: {len(part)} chars; {len(chapters)} chunks",flush=True)
    for i,s in enumerate(chapters,1):
        path=audio_path/f"{i:03}.mp3"
        for attempt in range(3):
            try:
                await edge_tts.Communicate(s,voice="pl-PL-ZofiaNeural",rate="-8%").save(str(path))
                if path.stat().st_size<1500:raise RuntimeError("Empty audio")
                print(f"{name}: {i}/{len(chapters)} {path.stat().st_size}",flush=True)
                break
            except Exception as e:
                path.unlink(missing_ok=True)
                print(f"Retry {i} #{attempt+1}: {e}",flush=True)
                if attempt==2:raise
                await asyncio.sleep(8*(attempt+1))
        await asyncio.sleep(0.5)
    (audio_path/"concat.txt").write_text("".join(f"file '{p.name}'\n" for p in sorted(audio_path.glob("???.mp3"))))
    subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","concat","-safe","0",
                    "-i",str(audio_path/"concat.txt"),"-c","copy",str(OUT/f"{name}_ZofiaNeural.mp3")],check=True)
    assert (OUT/f"{name}_ZofiaNeural.mp3").stat().st_size>300000
    print(f"COMPLETE {name}",flush=True)

async def main():
    for name,title,url in ARTICLES:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req,timeout=65) as r:
            Path(f"{name}.pdf").write_bytes(r.read())
        doc=pymupdf.open(f"{name}.pdf")
        assert 8<=len(doc)<=15,(name,len(doc))
        raw="\n".join(p.get_text("text",sort=True) for p in doc)
        pos=re.search(r"(?mi)^\s*(Wstęp|Wprowadzenie)\s*$",raw)
        assert pos, f"Missing introduction: {name}"
        raw=raw[pos.start():]
        end=re.search(r"(?mi)^\s*(Piśmiennictwo|Literatura|Adres do korespondencji)\s*$",raw)
        if end:raw=raw[:end.start()]
        text=title+". Autorzy: Łukasz Gawęda, Steffen Moritz i Andrzej Kokoszka. Psychiatria Polska, rok 2009. "+prepare(raw)
        assert len(text)>11000,(name,len(text))
        (OUT/f"{name}_tekst_do_kontroli.txt").write_text(text,encoding="utf-8")
        await narrate(name,text)
asyncio.run(main())