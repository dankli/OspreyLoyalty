terraform {
  required_version = ">= 1.5"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

resource "kubernetes_namespace" "osprey" {
  metadata {
    name = "osprey"
    labels = {
      "app.kubernetes.io/part-of" = "osprey-loyalty"
    }
  }
}

# Bounded everything applies to infrastructure too: the namespace gets a ceiling.
resource "kubernetes_resource_quota" "osprey" {
  metadata {
    name      = "osprey-quota"
    namespace = kubernetes_namespace.osprey.metadata[0].name
  }
  spec {
    hard = {
      pods              = "20"
      "requests.cpu"    = "4"
      "requests.memory" = "4Gi"
      "limits.cpu"      = "8"
      "limits.memory"   = "8Gi"
    }
  }
}
