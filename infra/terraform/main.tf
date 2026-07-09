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
    # Bumped for Phase 6: the namespace now also runs security (IdP), points-engine, and the
    # observability stack (jaeger, otel-collector, loki, and a promtail DaemonSet per node).
    hard = {
      pods              = "30"
      "requests.cpu"    = "6"
      "requests.memory" = "6Gi"
      "limits.cpu"      = "12"
      "limits.memory"   = "12Gi"
      # mongo + rabbitmq are StatefulSets with PVCs; bound the persistent storage too.
      "requests.storage" = "20Gi"
    }
  }
}
