(ns metabase-enterprise.semantic-layer.complexity-embedders
  "Pluggable embedding sources for the complexity score's synonym axis.

  An embedder is a function:

    (embedder entities) -> {normalized-name -> ^floats vector}

  where `entities` are `{:id :name :kind}` maps and the returned map supplies a vector for each name
  that has one available.
  Entities without an embedding are simply absent — the caller treats them as having no synonym signal.
  A nil embedder, an empty-map result, or a thrown exception all disable the synonym axis gracefully.

  For a search-index–backed embedder see [[metabase-enterprise.semantic-search.core/search-index-embedder]];
  this namespace holds the [[fn-embedder]] adapter used by tests and any future name-only cached
  embedder, plus the [[file-embedder]] used by the CLI when scoring a representation directory."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe."
  [s]
  (some-> s str/trim u/lower-case-en))

(defn fn-embedder
  "Build an embedder that delegates to a plain `(name-embed-fn names) -> [vectors]` function.
  Distinct normalized names are passed in; the returned vectors are zipped back by position.
  Names whose `name-embed-fn` returns nil are omitted from the result map."
  [name-embed-fn]
  (fn embed [entities]
    (let [names   (->> entities (keep (comp normalize-name :name)) distinct vec)
          vectors (when (seq names) (vec (name-embed-fn names)))]
      (into {} (filter val) (zipmap names vectors)))))

(defn file-embedder
  "Build an embedder from a pre-loaded `{name -> [float ...]}` map. Keys are run through
  [[normalize-name]] here so callers can hand in raw display names (`\"Revenue\"`, `\" Orders \"`)
  and still match what scoring looks up. Values may be seqs/vectors of floats or `^floats` arrays.
  Entities whose normalized name isn't in the map get no vector — same contract as the other embedders."
  [name->vec]
  (let [normalized (into {}
                         (keep (fn [[k v]]
                                 (when-let [n (normalize-name k)]
                                   [n (if (instance? (Class/forName "[F") v) v (float-array v))])))
                         name->vec)]
    (fn embed [_entities] normalized)))
