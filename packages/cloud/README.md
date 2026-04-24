# @a5c-ai/cloud

Spec-first workspace for the Babysitter deployment utility.

This package is intended to become the monorepo's deployment SDK + CLI for:

- local Minikube installs
- installs onto existing Kubernetes clusters
- launching new Kubernetes clusters for cloud providers
- coordinated deployment of Babysitter repo utilities into a single cluster topology

The detailed contract lives in [SPEC.md](./SPEC.md).

Current status:

- package directory created
- deployment architecture specified
- upstream dependency gaps identified and tracked as kanban issues before implementation

