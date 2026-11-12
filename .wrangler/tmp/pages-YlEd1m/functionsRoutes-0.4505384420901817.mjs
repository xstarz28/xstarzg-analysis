import { onRequestGet as __api_analysis_full_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/analysis/full.js"
import { onRequestGet as __api_auth_config_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/auth/config.js"
import { onRequestPost as __api_auth_google_js_onRequestPost } from "/home/user/xstarzg-analysis/functions/api/auth/google.js"
import { onRequestGet as __api_auth_me_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/auth/me.js"
import { onRequestPost as __api_billing_verify_bsc_js_onRequestPost } from "/home/user/xstarzg-analysis/functions/api/billing/verify-bsc.js"
import { onRequestGet as __api_market_instruments_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/market/instruments.js"
import { onRequestGet as __api_market_ohlcv_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/market/ohlcv.js"
import { onRequestGet as __api_market_quotes_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/market/quotes.js"
import { onRequestOptions as __api_market_quotes_js_onRequestOptions } from "/home/user/xstarzg-analysis/functions/api/market/quotes.js"
import { onRequestPost as __api_market_quotes_js_onRequestPost } from "/home/user/xstarzg-analysis/functions/api/market/quotes.js"
import { onRequestGet as __api_market_top_signals_js_onRequestGet } from "/home/user/xstarzg-analysis/functions/api/market/top-signals.js"
import { onRequest as __api_admin_overview_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/admin/overview.js"
import { onRequest as __api_auth_session_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/auth/session.js"
import { onRequest as __api_billing_invoice_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/billing/invoice.js"
import { onRequest as __api_fundamentals_overview_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/fundamentals/overview.js"
import { onRequest as __api_fundamentals_sec_edgar_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/fundamentals/sec-edgar.js"
import { onRequest as __api_market_analyze_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/market/analyze.js"
import { onRequest as __api_scanner_recommendations_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/scanner/recommendations.js"
import { onRequest as __api_health_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/health.js"
import { onRequest as __lib_db_js_onRequest } from "/home/user/xstarzg-analysis/functions/lib/db.js"
import { onRequest as __api__middleware_js_onRequest } from "/home/user/xstarzg-analysis/functions/api/_middleware.js"

export const routes = [
    {
      routePath: "/api/analysis/full",
      mountPath: "/api/analysis",
      method: "GET",
      middlewares: [],
      modules: [__api_analysis_full_js_onRequestGet],
    },
  {
      routePath: "/api/auth/config",
      mountPath: "/api/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_config_js_onRequestGet],
    },
  {
      routePath: "/api/auth/google",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_google_js_onRequestPost],
    },
  {
      routePath: "/api/auth/me",
      mountPath: "/api/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_me_js_onRequestGet],
    },
  {
      routePath: "/api/billing/verify-bsc",
      mountPath: "/api/billing",
      method: "POST",
      middlewares: [],
      modules: [__api_billing_verify_bsc_js_onRequestPost],
    },
  {
      routePath: "/api/market/instruments",
      mountPath: "/api/market",
      method: "GET",
      middlewares: [],
      modules: [__api_market_instruments_js_onRequestGet],
    },
  {
      routePath: "/api/market/ohlcv",
      mountPath: "/api/market",
      method: "GET",
      middlewares: [],
      modules: [__api_market_ohlcv_js_onRequestGet],
    },
  {
      routePath: "/api/market/quotes",
      mountPath: "/api/market",
      method: "GET",
      middlewares: [],
      modules: [__api_market_quotes_js_onRequestGet],
    },
  {
      routePath: "/api/market/quotes",
      mountPath: "/api/market",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_market_quotes_js_onRequestOptions],
    },
  {
      routePath: "/api/market/quotes",
      mountPath: "/api/market",
      method: "POST",
      middlewares: [],
      modules: [__api_market_quotes_js_onRequestPost],
    },
  {
      routePath: "/api/market/top-signals",
      mountPath: "/api/market",
      method: "GET",
      middlewares: [],
      modules: [__api_market_top_signals_js_onRequestGet],
    },
  {
      routePath: "/api/admin/overview",
      mountPath: "/api/admin",
      method: "",
      middlewares: [],
      modules: [__api_admin_overview_js_onRequest],
    },
  {
      routePath: "/api/auth/session",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_session_js_onRequest],
    },
  {
      routePath: "/api/billing/invoice",
      mountPath: "/api/billing",
      method: "",
      middlewares: [],
      modules: [__api_billing_invoice_js_onRequest],
    },
  {
      routePath: "/api/fundamentals/overview",
      mountPath: "/api/fundamentals",
      method: "",
      middlewares: [],
      modules: [__api_fundamentals_overview_js_onRequest],
    },
  {
      routePath: "/api/fundamentals/sec-edgar",
      mountPath: "/api/fundamentals",
      method: "",
      middlewares: [],
      modules: [__api_fundamentals_sec_edgar_js_onRequest],
    },
  {
      routePath: "/api/market/analyze",
      mountPath: "/api/market",
      method: "",
      middlewares: [],
      modules: [__api_market_analyze_js_onRequest],
    },
  {
      routePath: "/api/scanner/recommendations",
      mountPath: "/api/scanner",
      method: "",
      middlewares: [],
      modules: [__api_scanner_recommendations_js_onRequest],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_health_js_onRequest],
    },
  {
      routePath: "/lib/db",
      mountPath: "/lib",
      method: "",
      middlewares: [],
      modules: [__lib_db_js_onRequest],
    },
  {
      routePath: "/api",
      mountPath: "/api",
      method: "",
      middlewares: [__api__middleware_js_onRequest],
      modules: [],
    },
  ]