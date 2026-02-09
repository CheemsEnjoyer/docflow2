---
base_model:
- deepseek-ai/DeepSeek-OCR-2
pipeline_tag: image-text-to-text
language:
- multilingual
tags:
- deepseek
- unsloth
- vision-language
- ocr
- custom_code
license: apache-2.0
library_name: transformers
---
# Read our Guide How to: [Run & Fine-tune DeepSeek-OCR 2](https://docs.unsloth.ai/models/deepseek-ocr-2).
<div>
<p style="margin-top: 0;margin-bottom: 0;">
    <em>This DeepSeek-OCR 2 upload was edited to enable inference & fine-tuning on the latest transformers (no accuracy change).</em>
  </p>
  <div style="display: flex; gap: 5px; align-items: center; ">
    <a href="https://github.com/unslothai/unsloth/">
      <img src="https://github.com/unslothai/unsloth/raw/main/images/unsloth%20new%20logo.png" width="133">
    </a>
    <a href="https://discord.gg/unsloth">
      <img src="https://github.com/unslothai/unsloth/raw/main/images/Discord%20button.png" width="173">
    </a>
    <a href="https://docs.unsloth.ai/models/deepseek-ocr-2">
      <img src="https://raw.githubusercontent.com/unslothai/unsloth/refs/heads/main/images/documentation%20green%20button.png" width="143">
    </a>
  </div>
<h1 style="margin-top: 0rem;">✨ Read our DeepSeek-OCR 2 Guide <a href="https://docs.unsloth.ai/models/deepseek-ocr-2">here</a>!</h1>
</div>

- Fine-tune DeepSeek-OCR 2 for free using our [Google Colab notebook](https://colab.research.google.com/github/unslothai/notebooks/blob/main/nb/Deepseek_OCR_2_(3B).ipynb)
- View the rest of our notebooks in our [docs here](https://docs.unsloth.ai/get-started/unsloth-notebooks).
  
---

<div align="center">
  <img src="https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/logo.svg?raw=true" width="60%" alt="DeepSeek AI" />
</div>
<hr>
<div align="center">
  <a href="https://www.deepseek.com/" target="_blank">
    <img alt="Homepage" src="https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/badge.svg?raw=true" />
  </a>
  <a href="https://huggingface.co/deepseek-ai/DeepSeek-OCR-2" target="_blank">
    <img alt="Hugging Face" src="https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-DeepSeek%20AI-ffc107?color=ffc107&logoColor=white" />
  </a>

</div>

<div align="center">

  <a href="https://discord.gg/Tc7c45Zzu5" target="_blank">
    <img alt="Discord" src="https://img.shields.io/badge/Discord-DeepSeek%20AI-7289da?logo=discord&logoColor=white&color=7289da" />
  </a>
  <a href="https://twitter.com/deepseek_ai" target="_blank">
    <img alt="Twitter Follow" src="https://img.shields.io/badge/Twitter-deepseek_ai-white?logo=x&logoColor=white" />
  </a>

</div>



<p align="center">
  <a href="https://github.com/deepseek-ai/DeepSeek-OCR-2"><b>🌟 Github</b></a> |
  <a href="https://huggingface.co/deepseek-ai/DeepSeek-OCR-2"><b>📥 Model Download</b></a> |
  <a href="https://github.com/deepseek-ai/DeepSeek-OCR-2/blob/main/DeepSeek_OCR2_paper.pdf"><b>📄 Paper Link</b></a> |
  <a href="https://github.com/deepseek-ai/DeepSeek-OCR-2/blob/main/DeepSeek_OCR2_paper.pdf"><b>📄 Arxiv Paper Link</b></a> |
</p>
<h2>
<p align="center">
  <a href="">DeepSeek-OCR 2: Visual Causal Flow</a>
</p>
</h2>
<p align="center">
<img src="assets/fig1.png" style="width: 900px" align=center>
</p>
<p align="center">
<a href="">Explore more human-like visual encoding.</a>       
</p>

## Usage

Inference using Huggingface transformers on NVIDIA GPUs. Requirements tested on python 3.12.9 + CUDA11.8：

```
torch==2.6.0
transformers==4.46.3
tokenizers==0.20.3
einops
addict 
easydict
pip install flash-attn==2.7.3 --no-build-isolation
```

```python
from transformers import AutoModel, AutoTokenizer
import torch
import os
os.environ["CUDA_VISIBLE_DEVICES"] = '0'
model_name = 'deepseek-ai/DeepSeek-OCR-2'

tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
model = AutoModel.from_pretrained(model_name, _attn_implementation='flash_attention_2', trust_remote_code=True, use_safetensors=True)
model = model.eval().cuda().to(torch.bfloat16)

# prompt = "<image>\nFree OCR. "
prompt = "<image>\n<|grounding|>Convert the document to markdown. "
image_file = 'your_image.jpg'
output_path = 'your/output/dir'


res = model.infer(tokenizer, prompt=prompt, image_file=image_file, output_path = output_path, base_size = 1024, image_size = 768, crop_mode=True, save_results = True)
```

## vLLM


Refer to [🌟GitHub](https://github.com/deepseek-ai/DeepSeek-OCR-2/) for guidance on model inference acceleration and PDF processing, etc.<!--  -->

## Support-Modes
- Dynamic resolution
  - Default: (0-6)×768×768 + 1×1024×1024 — (0-6)×144 + 256 visual tokens ✅

## Prompts examples
```python
# document: <image>\n<|grounding|>Convert the document to markdown.
# other image: <image>\n<|grounding|>OCR this image.
# without layouts: <image>\nFree OCR.
# figures in document: <image>\nParse the figure.
# general: <image>\nDescribe this image in detail.
# rec: <image>\nLocate <|ref|>xxxx<|/ref|> in the image.
```


## Acknowledgement

We would like to thank [DeepSeek-OCR](https://github.com/deepseek-ai/DeepSeek-OCR/), [Vary](https://github.com/Ucas-HaoranWei/Vary/), [GOT-OCR2.0](https://github.com/Ucas-HaoranWei/GOT-OCR2.0/), [MinerU](https://github.com/opendatalab/MinerU), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) for their valuable models and ideas.

We also appreciate the benchmark [OmniDocBench](https://github.com/opendatalab/OmniDocBench).


## Citation

```bibtex
coming soon~