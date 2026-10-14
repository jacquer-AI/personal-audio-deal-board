import asyncio, re, subprocess, urllib.request
from pathlib import Path
import fitz, edge_tts

out=Path("audiobook_output")
out.mkdir(exist_ok=True)
url="https://www.psychiatriapolska.pl/pdf-81109-79576?filename=Mocne-strony-osob-chorych.pdf"
request=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(request,timeout=60) as response:
    Path("source.pdf").write_bytes(response.read())
doc=fitz.open("source.pdf")
assert len(doc)>=11, f"Unexpected page count: {len(doc)}"
pages=[]
for i,page in enumerate(doc):
    t=page.get_text("text")
    if i==0 or i==11: continue
    if i==1:
        assert "Wstęp\n" in t
        t=t.split("Wstęp\n",1)[1]
    if 2<=i<=10:
        t=re.sub(r"^\s*(?:Paulina Rozya i wsp\.|Mocne strony osób chorych na schizofrenię i\s*osób zdrowych – podobieństwa i\s*różnice)\s*\n","",t,count=1)
        t=re.sub(r"^\s*\d{2,3}\s*\n","",t,count=1)
        t=re.sub(r"^\s*(?:Paulina Rozya i wsp\.|Mocne strony osób chorych na schizofrenię i\s*osób zdrowych – podobieństwa i\s*różnice)\s*\n","",t,count=1)
    if i==4:
        assert "Tabela 1." in t
        t=t.split("Tabela 1.",1)[0]
    if i==5:
        assert "Jak pokazano" in t and "Tabela 2." in t
        t="Jak pokazano"+t.split("Jak pokazano",1)[1].split("Tabela 2.",1)[0]
    if i==6:
        assert "Istotne związki" in t
        t="Istotne związki"+t.split("Istotne związki",1)[1]
    if i==10: t=t.split("Piśmiennictwo",1)[0]
    pages.append(t)

def clean(s):
    s=s.replace("\u00ad","").replace("\xa0"," ").replace("\ufeff","").replace("\u200b","")
    s=re.sub(r"([a-ząćęłńóśźż])[-‐]\s*\n\s*([a-ząćęłńóśźż])",r"\1\2",s,flags=re.I)
    s=re.sub(r"\s*\n\s*"," ",s)
    s=re.sub(r"\[\s*\d+(?:\s*,\s*\d+)*\s*\]","",s)
    return re.sub(r"\s+"," ",s).replace("––"," ").strip()

text=clean(" ".join(pages))
for h in ["Materiał i metoda","Wyniki","Dyskusja","Wnioski"]:
    text=text.replace(h+" ",". "+h+". ",1)
text=("Mocne strony osób chorych na schizofrenię i osób zdrowych. Podobieństwa i różnice. "
      "Paulina Rozya, Maryla Sawicka, Agnieszka Żochowska i Paweł Bronowski. "
      "Psychiatria Polska, rok 2019. Czytanie tekstu głównego bez angielskiego streszczenia, "
      "tabel liczbowych i bibliografii. Wstęp. "+text)
assert 20000<len(text)<40000, len(text)
assert "Wnioski." in text and "Dyskusja." in text and "Piśmiennictwo" not in text
(out/"Transkrypcja_do_weryfikacji.txt").write_text(text,encoding="utf-8")
chunks=[]
current=""
for sent in re.split(r"(?<=[.!?])\s+",text):
    if len(sent)>2800: raise ValueError("Sentence exceeds 2800 chars")
    if current and len(current)+len(sent)+1>2700:
        chunks.append(current.strip())
        current=""
    current+=(" " if current else "")+sent
if current: chunks.append(current.strip())
assert 7<=len(chunks)<=20
print(f"Full text: {len(text)} characters, {len(chunks)} chapters",flush=True)

async def generate():
    for i,chunk in enumerate(chunks,1):
        path=out/f"Rozya_2019_{i:02d}.mp3"
        for attempt in range(3):
            try:
                await edge_tts.Communicate(chunk, voice="pl-PL-MarekNeural",rate="-5%").save(str(path))
                if path.stat().st_size<10000: raise RuntimeError("No audio")
                print(f"{i}/{len(chunks)} OK {path.name}",flush=True)
                break
            except Exception as e:
                path.unlink(missing_ok=True)
                print(f"Retry {attempt+1}: {e}",flush=True)
                if attempt==2: raise
                await asyncio.sleep(6*(attempt+1))
        await asyncio.sleep(1.0)
asyncio.run(generate())

with (out/"concat.txt").open("w") as f:
    for p in sorted(out.glob("Rozya_2019_??.mp3")):
        f.write(f"file '{p.name}'\n")
# imageio-ffmpeg includes a standalone ffmpeg binary on Linux runners.
import sys
subprocess.run([sys.executable,"-m","pip","install","--disable-pip-version-check","-q","imageio-ffmpeg"],check=True)
import imageio_ffmpeg
ffmpeg_bin=imageio_ffmpeg.get_ffmpeg_exe()
combined=out/"ROZYA_2019_CALOSC_MarekNeural.mp3"
subprocess.run([ffmpeg_bin,"-hide_banner","-loglevel","error","-f","concat","-safe","0",
                "-i",str(out/"concat.txt"),"-c","copy",str(combined)],check=True)
assert combined.stat().st_size>500000, "Merged MP3 is unexpectedly small"
print(f"COMPLETE full_audiobook={combined.name} bytes={combined.stat().st_size}",flush=True)
