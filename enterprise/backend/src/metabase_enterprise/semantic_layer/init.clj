(ns metabase-enterprise.semantic-layer.init
  "Startup wiring for the semantic-layer module.
  Registers a startup hook that publishes the complexity score for this instance once per boot:
  an :info log via [[metabase-enterprise.semantic-layer.complexity/complexity-scores]] and, when
  anonymous analytics is on, a Snowplow event per (catalog × axis). Runs on a background task so
  startup isn't blocked by the scoring pass, and runs unconditionally so operators have a
  locally-visible score on instances with telemetry disabled.

  The scoring pass is guarded by a cluster-wide lock so that on multi-node deployments the
  expensive scoring query + Snowplow publish path serialize across nodes rather than running
  concurrently on every boot."
  (:require
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(def ^:private cluster-lock-name ::publish-complexity-score-lock)

(defmethod startup/def-startup-logic! ::PublishSemanticComplexityScore [_]
  (quick-task/submit-task!
   (fn []
     (try
       (cluster-lock/with-cluster-lock cluster-lock-name
         (complexity/complexity-scores))
       (catch Throwable t
         (log/warn t "Failed to compute semantic complexity score at startup"))))))
