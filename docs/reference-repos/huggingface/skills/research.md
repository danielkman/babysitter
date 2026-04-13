# huggingface/skills

- **Archetype**: mega-skill-pack
- **Stars**: 10,166
- **Last pushed**: 2026-04-13
- **License**: Apache-2.0
- **Discovered**: 2026-04-13
- **Source**: backlog-processing
- **Skills found**: 11 (hf-cli, huggingface-community-evals, huggingface-datasets, huggingface-gradio, huggingface-llm-trainer, huggingface-paper-publisher, huggingface-papers, huggingface-tool-builder, huggingface-trackio, huggingface-vision-trainer, transformers-js)

## Summary
Hugging Face's official skill collection for AI/ML development workflows, compatible with Claude Code, Codex, Gemini CLI, and Cursor. Contains 11 specialized skills covering the complete ML pipeline: datasets, training (LLM and vision), evaluation, Gradio apps, paper publishing, tool building, and deployment. Follows the standardized Agent Skills format with multi-harness plugin support and includes MCP server integration.

## Assessment
HIGH VALUE. This is an authoritative mega-skill-pack from Hugging Face containing production-grade ML workflows. The skills encode detailed procedural knowledge for complex tasks like model training (SFT, DPO, GRPO, reward modeling), dataset preparation and validation, evaluation pipeline setup, and Gradio app deployment. The training skills particularly contain sophisticated infrastructure management, cost estimation, and monitoring procedures that are directly extractable as specializations/data-science-ml/ processes.

## Extraction Priority
HIGH - Contains official Hugging Face workflows that are directly transferable:
- ML model training pipelines -> specializations/data-science-ml/
- Dataset preparation and validation workflows -> specializations/data-science-ml/
- Model evaluation and benchmarking processes -> specializations/data-science-ml/
- Gradio app development workflows -> specializations/frontend/ or specializations/data-science-ml/

## Skills Inventory

| Skill | Path | Domain | Transferable? | Notes |
|-------|------|--------|---------------|-------|
| huggingface-llm-trainer | skills/huggingface-llm-trainer/ | ML/Data | Yes - process | TRL training methods (SFT, DPO, GRPO), infrastructure management |
| huggingface-datasets | skills/huggingface-datasets/ | ML/Data | Yes - process | Dataset preparation, validation, Hub integration |
| huggingface-gradio | skills/huggingface-gradio/ | Frontend/ML | Yes - process | Interactive ML app development and deployment |
| huggingface-community-evals | skills/huggingface-community-evals/ | ML/Data | Yes - process | Model evaluation and benchmarking workflows |
| huggingface-vision-trainer | skills/huggingface-vision-trainer/ | ML/Data | Yes - process | Computer vision model training pipelines |
| huggingface-paper-publisher | skills/huggingface-paper-publisher/ | ML/Academic | Yes - pattern | Research paper publishing and model documentation |
| transformers-js | skills/transformers-js/ | Frontend/ML | Yes - process | Browser-based ML model deployment workflows |

## Processes
- **ml-model-training-pipeline**: Comprehensive workflow for training language models using TRL on Hugging Face infrastructure
  - Source: skills/huggingface-llm-trainer/SKILL.md (lines 10-50)
  - Placement: specializations/data-science-ml/
  - Inputs: Training data, model configuration, hardware requirements
  - Outputs: Trained model, training metrics, deployment artifacts
  - Complexity: complex
  - Notes: Covers SFT, DPO, GRPO, reward modeling, cost estimation, monitoring

- **dataset-preparation-workflow**: Systematic process for preparing and validating datasets for ML training
  - Source: skills/huggingface-datasets/SKILL.md
  - Placement: specializations/data-science-ml/
  - Inputs: Raw data, schema requirements, quality criteria
  - Outputs: Validated dataset, metadata, quality report
  - Complexity: moderate

- **gradio-app-development**: End-to-end process for building interactive ML applications with Gradio
  - Source: skills/huggingface-gradio/SKILL.md
  - Placement: specializations/data-science-ml/
  - Inputs: Model, UI requirements, deployment target
  - Outputs: Interactive app, deployment configuration, user documentation
  - Complexity: moderate

- **model-evaluation-pipeline**: Systematic approach to evaluating and benchmarking ML models
  - Source: skills/huggingface-community-evals/SKILL.md
  - Placement: specializations/data-science-ml/
  - Inputs: Model, evaluation datasets, benchmark criteria
  - Outputs: Performance metrics, comparison reports, leaderboard submissions
  - Complexity: moderate

## Plugin Ideas
- **ml-development-suite**: Comprehensive ML development environment with Hugging Face ecosystem integration
  - What install.md would do: Detect ML project type, install relevant HF skills, configure Hub authentication, set up training infrastructure, create evaluation pipelines
  - Processes it would copy: ml-model-training-pipeline, dataset-preparation-workflow, model-evaluation-pipeline
  - Configs/hooks it would create: HF CLI configuration, training job templates, evaluation scripts, deployment configs
  - Source evidence: 11 specialized ML skills covering complete pipeline from data to deployment

- **gradio-app-builder**: Plugin for rapid ML application prototyping and deployment
  - What install.md would do: Set up Gradio development environment, create app templates, configure deployment pipelines, install UI components
  - Processes it would copy: gradio-app-development, ml-model-integration
  - Configs/hooks it would create: Gradio templates, CSS themes, deployment scripts, monitoring configs
  - Source evidence: huggingface-gradio skill with interactive app development workflows

## Implicit Procedural Knowledge
- **TRL Training Method Selection**: Process for choosing appropriate training method (SFT vs DPO vs GRPO) based on use case and data
  - Source: huggingface-llm-trainer skill documentation and method comparison sections
  - Placement: specializations/data-science-ml/
  - Why codify: Provides systematic decision framework for training method selection in ML projects
  - Sketch: Use case analysis -> Data type evaluation -> Method capability mapping -> Cost-performance trade-off -> Training method recommendation

- **ML Infrastructure Cost Estimation**: Process for estimating and optimizing training costs on cloud ML infrastructure
  - Source: Training skills' hardware selection and cost estimation guidance
  - Placement: specializations/data-science-ml/
  - Why codify: Systematic approach to ML infrastructure planning that's reusable across cloud providers
  - Sketch: Model size analysis -> Training duration estimation -> Hardware requirements mapping -> Cost calculation -> Optimization recommendations