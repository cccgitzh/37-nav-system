import { onRequestDelete as __api_categories_js_onRequestDelete } from "/app/functions/api/categories.js"
import { onRequestGet as __api_categories_js_onRequestGet } from "/app/functions/api/categories.js"
import { onRequestPost as __api_categories_js_onRequestPost } from "/app/functions/api/categories.js"
import { onRequestPut as __api_categories_js_onRequestPut } from "/app/functions/api/categories.js"
import { onRequestDelete as __api_nodes_js_onRequestDelete } from "/app/functions/api/nodes.js"
import { onRequestGet as __api_nodes_js_onRequestGet } from "/app/functions/api/nodes.js"
import { onRequestPost as __api_nodes_js_onRequestPost } from "/app/functions/api/nodes.js"
import { onRequestPut as __api_nodes_js_onRequestPut } from "/app/functions/api/nodes.js"
import { onRequest as __api_parse_js_onRequest } from "/app/functions/api/parse.js"
import { onRequest as __api_search_js_onRequest } from "/app/functions/api/search.js"

export const routes = [
    {
      routePath: "/api/categories",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_categories_js_onRequestDelete],
    },
  {
      routePath: "/api/categories",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_categories_js_onRequestGet],
    },
  {
      routePath: "/api/categories",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_categories_js_onRequestPost],
    },
  {
      routePath: "/api/categories",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_categories_js_onRequestPut],
    },
  {
      routePath: "/api/nodes",
      mountPath: "/api",
      method: "DELETE",
      middlewares: [],
      modules: [__api_nodes_js_onRequestDelete],
    },
  {
      routePath: "/api/nodes",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_nodes_js_onRequestGet],
    },
  {
      routePath: "/api/nodes",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_nodes_js_onRequestPost],
    },
  {
      routePath: "/api/nodes",
      mountPath: "/api",
      method: "PUT",
      middlewares: [],
      modules: [__api_nodes_js_onRequestPut],
    },
  {
      routePath: "/api/parse",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_parse_js_onRequest],
    },
  {
      routePath: "/api/search",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_search_js_onRequest],
    },
  ]