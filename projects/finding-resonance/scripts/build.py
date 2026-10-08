"""Build only the individually reviewed Jesus-centered portfolio collection."""
import json,hashlib
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer,ENGLISH_STOP_WORDS
from sklearn.decomposition import TruncatedSVD
ROOT=Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'data/curated-stories.json').read_text())
stopwords=sorted(set(ENGLISH_STOP_WORDS)|{'feel','feeling','want','like','read','would','curious','experience','experiences','account','accounts','story','stories','involving','someone','looking','hear','explore'})
v=TfidfVectorizer(stop_words=stopwords,sublinear_tf=True,token_pattern=r'(?u)\b[a-zA-Z]{2,}\b',max_features=1600)
x=v.fit_transform([r['text'] for r in items]);svd=TruncatedSVD(n_components=min(48,len(items)-1),random_state=42);latent=svd.fit_transform(x);latent/=np.maximum(np.linalg.norm(latent,axis=1,keepdims=True),1e-12)
model={'vocabulary':{k:int(n) for k,n in v.vocabulary_.items()},'idf':v.idf_.round(6).tolist(),'components':svd.components_.round(6).tolist(),'vectors':latent.round(6).tolist(),'stopwords':stopwords,'terms':[dict(zip(row.indices.tolist(),row.data.round(6).tolist())) for row in x],'version':'2.0.0','dimensions':svd.n_components,'explainedVariance':float(svd.explained_variance_ratio_.sum())}
for name,val in [('corpus.json',items),('model.json',model)]: (ROOT/'dist'/name).write_text(json.dumps(val,ensure_ascii=False,separators=(',',':')))
(ROOT/'data/corpus.json').write_text(json.dumps(items,ensure_ascii=False,indent=2))
manifest={'version':'2.0.0','retrieved':'2026-10-08','records':len(items),'uniqueAccounts':len(items),'scope':'Individually reviewed explicit Jesus encounters and thematic reflections. No linked full accounts are republished or rated.','sources':[{'url':u,'permissionStatement':'This list is public domain and may be used by anyone.'} for u in sorted({r['source'] for r in items})],'screening':'Displayed excerpts individually reviewed for accurate Jesus/thematic classification and workplace-appropriate, non-graphic content. Informal screening, not an official PG-13 rating.','corpusSha256':hashlib.sha256((ROOT/'dist/corpus.json').read_bytes()).hexdigest()}
for p in [ROOT/'data/provenance.json',ROOT/'dist/provenance.json']:p.write_text(json.dumps(manifest,indent=2))
print('Built',len(items),'reviewed excerpts')
