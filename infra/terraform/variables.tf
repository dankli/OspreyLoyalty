variable "kubeconfig_path" {
  description = "Path to the kubeconfig used to reach the cluster (kind by default)."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Kube context to target — the kind cluster from infra/k8s/README.md."
  type        = string
  default     = "kind-osprey"
}
