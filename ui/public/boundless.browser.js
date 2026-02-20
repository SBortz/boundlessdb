// Boundless DCB Event Store - Browser Bundle
// https://github.com/SBortz/boundless

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// node_modules/sql.js/dist/sql-wasm-browser.js
var require_sql_wasm_browser = __commonJS({
  "node_modules/sql.js/dist/sql-wasm-browser.js"(exports, module) {
    var initSqlJsPromise = void 0;
    var initSqlJs2 = function(moduleConfig) {
      if (initSqlJsPromise) {
        return initSqlJsPromise;
      }
      initSqlJsPromise = new Promise(function(resolveModule, reject) {
        var Module = typeof moduleConfig !== "undefined" ? moduleConfig : {};
        var originalOnAbortFunction = Module["onAbort"];
        Module["onAbort"] = function(errorThatCausedAbort) {
          reject(new Error(errorThatCausedAbort));
          if (originalOnAbortFunction) {
            originalOnAbortFunction(errorThatCausedAbort);
          }
        };
        Module["postRun"] = Module["postRun"] || [];
        Module["postRun"].push(function() {
          resolveModule(Module);
        });
        module = void 0;
        var l;
        l || (l = typeof Module != "undefined" ? Module : {});
        var aa = !!globalThis.window, ba = !!globalThis.WorkerGlobalScope;
        l.onRuntimeInitialized = function() {
          function a(f, k) {
            switch (typeof k) {
              case "boolean":
                bc(f, k ? 1 : 0);
                break;
              case "number":
                cc(f, k);
                break;
              case "string":
                dc(f, k, -1, -1);
                break;
              case "object":
                if (null === k) eb(f);
                else if (null != k.length) {
                  var n = ca(k.length);
                  m.set(k, n);
                  ec(f, n, k.length, -1);
                  da(n);
                } else ra(f, "Wrong API use : tried to return a value of an unknown type (" + k + ").", -1);
                break;
              default:
                eb(f);
            }
          }
          function b(f, k) {
            for (var n = [], p = 0; p < f; p += 1) {
              var u = r(k + 4 * p, "i32"), v = fc(u);
              if (1 === v || 2 === v) u = gc(u);
              else if (3 === v) u = hc(u);
              else if (4 === v) {
                v = u;
                u = ic(v);
                v = jc(v);
                for (var K = new Uint8Array(u), G = 0; G < u; G += 1) K[G] = m[v + G];
                u = K;
              } else u = null;
              n.push(u);
            }
            return n;
          }
          function c(f, k) {
            this.Qa = f;
            this.db = k;
            this.Oa = 1;
            this.xb = [];
          }
          function d(f, k) {
            this.db = k;
            this.nb = ea(f);
            if (null === this.nb) throw Error("Unable to allocate memory for the SQL string");
            this.tb = this.nb;
            this.fb = this.Cb = null;
          }
          function e(f) {
            this.filename = "dbfile_" + (4294967295 * Math.random() >>> 0);
            if (null != f) {
              var k = this.filename, n = "/", p = k;
              n && (n = "string" == typeof n ? n : fa(n), p = k ? ha(n + "/" + k) : n);
              k = ia(true, true);
              p = ja(
                p,
                k
              );
              if (f) {
                if ("string" == typeof f) {
                  n = Array(f.length);
                  for (var u = 0, v = f.length; u < v; ++u) n[u] = f.charCodeAt(u);
                  f = n;
                }
                ka(p, k | 146);
                n = la(p, 577);
                ma(n, f, 0, f.length, 0);
                na(n);
                ka(p, k);
              }
            }
            this.handleError(q(this.filename, g));
            this.db = r(g, "i32");
            hb(this.db);
            this.ob = {};
            this.Sa = {};
          }
          var g = y(4), h = l.cwrap, q = h("sqlite3_open", "number", ["string", "number"]), w = h("sqlite3_close_v2", "number", ["number"]), t = h("sqlite3_exec", "number", ["number", "string", "number", "number", "number"]), x = h("sqlite3_changes", "number", ["number"]), D = h(
            "sqlite3_prepare_v2",
            "number",
            ["number", "string", "number", "number", "number"]
          ), ib = h("sqlite3_sql", "string", ["number"]), lc = h("sqlite3_normalized_sql", "string", ["number"]), jb = h("sqlite3_prepare_v2", "number", ["number", "number", "number", "number", "number"]), mc = h("sqlite3_bind_text", "number", ["number", "number", "number", "number", "number"]), kb = h("sqlite3_bind_blob", "number", ["number", "number", "number", "number", "number"]), nc = h("sqlite3_bind_double", "number", ["number", "number", "number"]), oc = h("sqlite3_bind_int", "number", [
            "number",
            "number",
            "number"
          ]), pc = h("sqlite3_bind_parameter_index", "number", ["number", "string"]), qc = h("sqlite3_step", "number", ["number"]), rc = h("sqlite3_errmsg", "string", ["number"]), sc = h("sqlite3_column_count", "number", ["number"]), tc = h("sqlite3_data_count", "number", ["number"]), uc = h("sqlite3_column_double", "number", ["number", "number"]), lb = h("sqlite3_column_text", "string", ["number", "number"]), vc = h("sqlite3_column_blob", "number", ["number", "number"]), wc = h("sqlite3_column_bytes", "number", ["number", "number"]), xc = h(
            "sqlite3_column_type",
            "number",
            ["number", "number"]
          ), yc = h("sqlite3_column_name", "string", ["number", "number"]), zc = h("sqlite3_reset", "number", ["number"]), Ac = h("sqlite3_clear_bindings", "number", ["number"]), Bc = h("sqlite3_finalize", "number", ["number"]), mb = h("sqlite3_create_function_v2", "number", "number string number number number number number number number".split(" ")), fc = h("sqlite3_value_type", "number", ["number"]), ic = h("sqlite3_value_bytes", "number", ["number"]), hc = h("sqlite3_value_text", "string", ["number"]), jc = h(
            "sqlite3_value_blob",
            "number",
            ["number"]
          ), gc = h("sqlite3_value_double", "number", ["number"]), cc = h("sqlite3_result_double", "", ["number", "number"]), eb = h("sqlite3_result_null", "", ["number"]), dc = h("sqlite3_result_text", "", ["number", "string", "number", "number"]), ec = h("sqlite3_result_blob", "", ["number", "number", "number", "number"]), bc = h("sqlite3_result_int", "", ["number", "number"]), ra = h("sqlite3_result_error", "", ["number", "string", "number"]), nb = h("sqlite3_aggregate_context", "number", ["number", "number"]), hb = h(
            "RegisterExtensionFunctions",
            "number",
            ["number"]
          ), ob = h("sqlite3_update_hook", "number", ["number", "number", "number"]);
          c.prototype.bind = function(f) {
            if (!this.Qa) throw "Statement closed";
            this.reset();
            return Array.isArray(f) ? this.Qb(f) : null != f && "object" === typeof f ? this.Rb(f) : true;
          };
          c.prototype.step = function() {
            if (!this.Qa) throw "Statement closed";
            this.Oa = 1;
            var f = qc(this.Qa);
            switch (f) {
              case 100:
                return true;
              case 101:
                return false;
              default:
                throw this.db.handleError(f);
            }
          };
          c.prototype.Jb = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            return uc(this.Qa, f);
          };
          c.prototype.Xb = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            f = lb(this.Qa, f);
            if ("function" !== typeof BigInt) throw Error("BigInt is not supported");
            return BigInt(f);
          };
          c.prototype.Yb = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            return lb(this.Qa, f);
          };
          c.prototype.getBlob = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            var k = wc(this.Qa, f);
            f = vc(this.Qa, f);
            for (var n = new Uint8Array(k), p = 0; p < k; p += 1) n[p] = m[f + p];
            return n;
          };
          c.prototype.get = function(f, k) {
            k = k || {};
            null != f && this.bind(f) && this.step();
            f = [];
            for (var n = tc(this.Qa), p = 0; p < n; p += 1) switch (xc(this.Qa, p)) {
              case 1:
                var u = k.useBigInt ? this.Xb(p) : this.Jb(p);
                f.push(u);
                break;
              case 2:
                f.push(this.Jb(p));
                break;
              case 3:
                f.push(this.Yb(p));
                break;
              case 4:
                f.push(this.getBlob(p));
                break;
              default:
                f.push(null);
            }
            return f;
          };
          c.prototype.getColumnNames = function() {
            for (var f = [], k = sc(this.Qa), n = 0; n < k; n += 1) f.push(yc(this.Qa, n));
            return f;
          };
          c.prototype.getAsObject = function(f, k) {
            f = this.get(f, k);
            k = this.getColumnNames();
            for (var n = {}, p = 0; p < k.length; p += 1) n[k[p]] = f[p];
            return n;
          };
          c.prototype.getSQL = function() {
            return ib(this.Qa);
          };
          c.prototype.getNormalizedSQL = function() {
            return lc(this.Qa);
          };
          c.prototype.run = function(f) {
            null != f && this.bind(f);
            this.step();
            return this.reset();
          };
          c.prototype.Gb = function(f, k) {
            null == k && (k = this.Oa, this.Oa += 1);
            f = ea(f);
            this.xb.push(f);
            this.db.handleError(mc(this.Qa, k, f, -1, 0));
          };
          c.prototype.Pb = function(f, k) {
            null == k && (k = this.Oa, this.Oa += 1);
            var n = ca(f.length);
            m.set(f, n);
            this.xb.push(n);
            this.db.handleError(kb(this.Qa, k, n, f.length, 0));
          };
          c.prototype.Fb = function(f, k) {
            null == k && (k = this.Oa, this.Oa += 1);
            this.db.handleError((f === (f | 0) ? oc : nc)(this.Qa, k, f));
          };
          c.prototype.Sb = function(f) {
            null == f && (f = this.Oa, this.Oa += 1);
            kb(this.Qa, f, 0, 0, 0);
          };
          c.prototype.Hb = function(f, k) {
            null == k && (k = this.Oa, this.Oa += 1);
            switch (typeof f) {
              case "string":
                this.Gb(f, k);
                return;
              case "number":
                this.Fb(f, k);
                return;
              case "bigint":
                this.Gb(f.toString(), k);
                return;
              case "boolean":
                this.Fb(f + 0, k);
                return;
              case "object":
                if (null === f) {
                  this.Sb(k);
                  return;
                }
                if (null != f.length) {
                  this.Pb(f, k);
                  return;
                }
            }
            throw "Wrong API use : tried to bind a value of an unknown type (" + f + ").";
          };
          c.prototype.Rb = function(f) {
            var k = this;
            Object.keys(f).forEach(function(n) {
              var p = pc(k.Qa, n);
              0 !== p && k.Hb(f[n], p);
            });
            return true;
          };
          c.prototype.Qb = function(f) {
            for (var k = 0; k < f.length; k += 1) this.Hb(f[k], k + 1);
            return true;
          };
          c.prototype.reset = function() {
            this.freemem();
            return 0 === Ac(this.Qa) && 0 === zc(this.Qa);
          };
          c.prototype.freemem = function() {
            for (var f; void 0 !== (f = this.xb.pop()); ) da(f);
          };
          c.prototype.free = function() {
            this.freemem();
            var f = 0 === Bc(this.Qa);
            delete this.db.ob[this.Qa];
            this.Qa = 0;
            return f;
          };
          d.prototype.next = function() {
            if (null === this.nb) return { done: true };
            null !== this.fb && (this.fb.free(), this.fb = null);
            if (!this.db.db) throw this.zb(), Error("Database closed");
            var f = oa(), k = y(4);
            pa(g);
            pa(k);
            try {
              this.db.handleError(jb(this.db.db, this.tb, -1, g, k));
              this.tb = r(k, "i32");
              var n = r(g, "i32");
              if (0 === n) return this.zb(), { done: true };
              this.fb = new c(n, this.db);
              this.db.ob[n] = this.fb;
              return { value: this.fb, done: false };
            } catch (p) {
              throw this.Cb = z(this.tb), this.zb(), p;
            } finally {
              qa(f);
            }
          };
          d.prototype.zb = function() {
            da(this.nb);
            this.nb = null;
          };
          d.prototype.getRemainingSQL = function() {
            return null !== this.Cb ? this.Cb : z(this.tb);
          };
          "function" === typeof Symbol && "symbol" === typeof Symbol.iterator && (d.prototype[Symbol.iterator] = function() {
            return this;
          });
          e.prototype.run = function(f, k) {
            if (!this.db) throw "Database closed";
            if (k) {
              f = this.prepare(f, k);
              try {
                f.step();
              } finally {
                f.free();
              }
            } else this.handleError(t(this.db, f, 0, 0, g));
            return this;
          };
          e.prototype.exec = function(f, k, n) {
            if (!this.db) throw "Database closed";
            var p = k = null, u = null;
            try {
              u = p = ea(f);
              var v = y(4);
              for (f = []; 0 !== r(u, "i8"); ) {
                pa(g);
                pa(v);
                this.handleError(jb(
                  this.db,
                  u,
                  -1,
                  g,
                  v
                ));
                var K = r(g, "i32");
                u = r(v, "i32");
                if (0 !== K) {
                  var G = null;
                  for (k = new c(K, this); k.step(); ) null === G && (G = { lc: k.getColumnNames(), values: [] }, f.push(G)), G.values.push(k.get(null, n));
                  k.free();
                }
              }
              return f;
            } catch (L) {
              throw k && k.free(), L;
            } finally {
              p && da(p);
            }
          };
          e.prototype.each = function(f, k, n, p, u) {
            "function" === typeof k && (p = n, n = k, k = void 0);
            f = this.prepare(f, k);
            try {
              for (; f.step(); ) n(f.getAsObject(null, u));
            } finally {
              f.free();
            }
            if ("function" === typeof p) return p();
          };
          e.prototype.prepare = function(f) {
            pa(g);
            this.handleError(D(
              this.db,
              f,
              -1,
              g,
              0
            ));
            f = r(g, "i32");
            if (0 === f) throw "Nothing to prepare";
            var k = new c(f, this);
            return this.ob[f] = k;
          };
          e.prototype.iterateStatements = function(f) {
            return new d(f, this);
          };
          e.prototype["export"] = function() {
            Object.values(this.ob).forEach(function(k) {
              k.free();
            });
            Object.values(this.Sa).forEach(A);
            this.Sa = {};
            this.handleError(w(this.db));
            var f = sa(this.filename);
            this.handleError(q(this.filename, g));
            this.db = r(g, "i32");
            hb(this.db);
            return f;
          };
          e.prototype.close = function() {
            null !== this.db && (Object.values(this.ob).forEach(function(f) {
              f.free();
            }), Object.values(this.Sa).forEach(A), this.Sa = {}, this.eb && (A(this.eb), this.eb = void 0), this.handleError(w(this.db)), ta("/" + this.filename), this.db = null);
          };
          e.prototype.handleError = function(f) {
            if (0 === f) return null;
            f = rc(this.db);
            throw Error(f);
          };
          e.prototype.getRowsModified = function() {
            return x(this.db);
          };
          e.prototype.create_function = function(f, k) {
            Object.prototype.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
            var n = ua(function(p, u, v) {
              u = b(u, v);
              try {
                var K = k.apply(null, u);
              } catch (G) {
                ra(p, G, -1);
                return;
              }
              a(
                p,
                K
              );
            }, "viii");
            this.Sa[f] = n;
            this.handleError(mb(this.db, f, k.length, 1, 0, n, 0, 0, 0));
            return this;
          };
          e.prototype.create_aggregate = function(f, k) {
            var n = k.init || function() {
              return null;
            }, p = k.finalize || function(L) {
              return L;
            }, u = k.step;
            if (!u) throw "An aggregate function must have a step function in " + f;
            var v = {};
            Object.hasOwnProperty.call(this.Sa, f) && (A(this.Sa[f]), delete this.Sa[f]);
            k = f + "__finalize";
            Object.hasOwnProperty.call(this.Sa, k) && (A(this.Sa[k]), delete this.Sa[k]);
            var K = ua(function(L, P, Ka) {
              var V = nb(L, 1);
              Object.hasOwnProperty.call(
                v,
                V
              ) || (v[V] = n());
              P = b(P, Ka);
              P = [v[V]].concat(P);
              try {
                v[V] = u.apply(null, P);
              } catch (Dc) {
                delete v[V], ra(L, Dc, -1);
              }
            }, "viii"), G = ua(function(L) {
              var P = nb(L, 1);
              try {
                var Ka = p(v[P]);
              } catch (V) {
                delete v[P];
                ra(L, V, -1);
                return;
              }
              a(L, Ka);
              delete v[P];
            }, "vi");
            this.Sa[f] = K;
            this.Sa[k] = G;
            this.handleError(mb(this.db, f, u.length - 1, 1, 0, 0, K, G, 0));
            return this;
          };
          e.prototype.updateHook = function(f) {
            this.eb && (ob(this.db, 0, 0), A(this.eb), this.eb = void 0);
            if (!f) return this;
            this.eb = ua(function(k, n, p, u, v) {
              switch (n) {
                case 18:
                  k = "insert";
                  break;
                case 23:
                  k = "update";
                  break;
                case 9:
                  k = "delete";
                  break;
                default:
                  throw "unknown operationCode in updateHook callback: " + n;
              }
              p = z(p);
              u = z(u);
              if (v > Number.MAX_SAFE_INTEGER) throw "rowId too big to fit inside a Number";
              f(k, p, u, Number(v));
            }, "viiiij");
            ob(this.db, this.eb, 0);
            return this;
          };
          l.Database = e;
        };
        var va = "./this.program", wa = globalThis.document?.currentScript?.src;
        ba && (wa = self.location.href);
        var xa = "", ya, za;
        if (aa || ba) {
          try {
            xa = new URL(".", wa).href;
          } catch {
          }
          ba && (za = (a) => {
            var b = new XMLHttpRequest();
            b.open("GET", a, false);
            b.responseType = "arraybuffer";
            b.send(null);
            return new Uint8Array(b.response);
          });
          ya = async (a) => {
            a = await fetch(a, { credentials: "same-origin" });
            if (a.ok) return a.arrayBuffer();
            throw Error(a.status + " : " + a.url);
          };
        }
        var Aa = console.log.bind(console), B = console.error.bind(console), Ba, Ca = false, Da, m, C, Ea, E, F, Fa, Ga, H;
        function Ha() {
          var a = Ia.buffer;
          m = new Int8Array(a);
          Ea = new Int16Array(a);
          C = new Uint8Array(a);
          new Uint16Array(a);
          E = new Int32Array(a);
          F = new Uint32Array(a);
          Fa = new Float32Array(a);
          Ga = new Float64Array(a);
          H = new BigInt64Array(a);
          new BigUint64Array(a);
        }
        function Ja(a) {
          l.onAbort?.(a);
          a = "Aborted(" + a + ")";
          B(a);
          Ca = true;
          throw new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
        }
        var La;
        async function Ma(a) {
          if (!Ba) try {
            var b = await ya(a);
            return new Uint8Array(b);
          } catch {
          }
          if (a == La && Ba) a = new Uint8Array(Ba);
          else if (za) a = za(a);
          else throw "both async and sync fetching of the wasm failed";
          return a;
        }
        async function Na(a, b) {
          try {
            var c = await Ma(a);
            return await WebAssembly.instantiate(c, b);
          } catch (d) {
            B(`failed to asynchronously prepare wasm: ${d}`), Ja(d);
          }
        }
        async function Oa(a) {
          var b = La;
          if (!Ba) try {
            var c = fetch(b, { credentials: "same-origin" });
            return await WebAssembly.instantiateStreaming(c, a);
          } catch (d) {
            B(`wasm streaming compile failed: ${d}`), B("falling back to ArrayBuffer instantiation");
          }
          return Na(b, a);
        }
        class Pa {
          constructor(a) {
            __publicField(this, "name", "ExitStatus");
            this.message = `Program terminated with exit(${a})`;
            this.status = a;
          }
        }
        var Qa = (a) => {
          for (; 0 < a.length; ) a.shift()(l);
        }, Ra = [], Sa = [], Ta = () => {
          var a = l.preRun.shift();
          Sa.push(a);
        }, I = 0, Ua = null;
        function r(a, b = "i8") {
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              return m[a];
            case "i8":
              return m[a];
            case "i16":
              return Ea[a >> 1];
            case "i32":
              return E[a >> 2];
            case "i64":
              return H[a >> 3];
            case "float":
              return Fa[a >> 2];
            case "double":
              return Ga[a >> 3];
            case "*":
              return F[a >> 2];
            default:
              Ja(`invalid type for getValue: ${b}`);
          }
        }
        var Va = true;
        function pa(a) {
          var b = "i32";
          b.endsWith("*") && (b = "*");
          switch (b) {
            case "i1":
              m[a] = 0;
              break;
            case "i8":
              m[a] = 0;
              break;
            case "i16":
              Ea[a >> 1] = 0;
              break;
            case "i32":
              E[a >> 2] = 0;
              break;
            case "i64":
              H[a >> 3] = BigInt(0);
              break;
            case "float":
              Fa[a >> 2] = 0;
              break;
            case "double":
              Ga[a >> 3] = 0;
              break;
            case "*":
              F[a >> 2] = 0;
              break;
            default:
              Ja(`invalid type for setValue: ${b}`);
          }
        }
        var Wa = new TextDecoder(), Xa = (a, b, c, d) => {
          c = b + c;
          if (d) return c;
          for (; a[b] && !(b >= c); ) ++b;
          return b;
        }, z = (a, b, c) => a ? Wa.decode(C.subarray(a, Xa(C, a, b, c))) : "", Ya = (a, b) => {
          for (var c = 0, d = a.length - 1; 0 <= d; d--) {
            var e = a[d];
            "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
          }
          if (b) for (; c; c--) a.unshift("..");
          return a;
        }, ha = (a) => {
          var b = "/" === a.charAt(0), c = "/" === a.slice(-1);
          (a = Ya(a.split("/").filter((d) => !!d), !b).join("/")) || b || (a = ".");
          a && c && (a += "/");
          return (b ? "/" : "") + a;
        }, Za = (a) => {
          var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
          a = b[0];
          b = b[1];
          if (!a && !b) return ".";
          b && (b = b.slice(0, -1));
          return a + b;
        }, $a = (a) => a && a.match(/([^\/]+|\/)\/*$/)[1], ab = () => (a) => crypto.getRandomValues(a), bb = (a) => {
          (bb = ab())(a);
        }, cb = (...a) => {
          for (var b = "", c = false, d = a.length - 1; -1 <= d && !c; d--) {
            c = 0 <= d ? a[d] : "/";
            if ("string" != typeof c) throw new TypeError("Arguments to path.resolve must be strings");
            if (!c) return "";
            b = c + "/" + b;
            c = "/" === c.charAt(0);
          }
          b = Ya(b.split("/").filter((e) => !!e), !c).join("/");
          return (c ? "/" : "") + b || ".";
        }, db = (a) => {
          var b = Xa(a, 0);
          return Wa.decode(a.buffer ? a.subarray(0, b) : new Uint8Array(a.slice(0, b)));
        }, fb = [], gb = (a) => {
          for (var b = 0, c = 0; c < a.length; ++c) {
            var d = a.charCodeAt(c);
            127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
          }
          return b;
        }, J = (a, b, c, d) => {
          if (!(0 < d)) return 0;
          var e = c;
          d = c + d - 1;
          for (var g = 0; g < a.length; ++g) {
            var h = a.codePointAt(g);
            if (127 >= h) {
              if (c >= d) break;
              b[c++] = h;
            } else if (2047 >= h) {
              if (c + 1 >= d) break;
              b[c++] = 192 | h >> 6;
              b[c++] = 128 | h & 63;
            } else if (65535 >= h) {
              if (c + 2 >= d) break;
              b[c++] = 224 | h >> 12;
              b[c++] = 128 | h >> 6 & 63;
              b[c++] = 128 | h & 63;
            } else {
              if (c + 3 >= d) break;
              b[c++] = 240 | h >> 18;
              b[c++] = 128 | h >> 12 & 63;
              b[c++] = 128 | h >> 6 & 63;
              b[c++] = 128 | h & 63;
              g++;
            }
          }
          b[c] = 0;
          return c - e;
        }, pb = [];
        function qb(a, b) {
          pb[a] = { input: [], output: [], jb: b };
          rb(a, sb);
        }
        var sb = { open(a) {
          var b = pb[a.node.mb];
          if (!b) throw new M(43);
          a.Va = b;
          a.seekable = false;
        }, close(a) {
          a.Va.jb.kb(a.Va);
        }, kb(a) {
          a.Va.jb.kb(a.Va);
        }, read(a, b, c, d) {
          if (!a.Va || !a.Va.jb.Kb) throw new M(60);
          for (var e = 0, g = 0; g < d; g++) {
            try {
              var h = a.Va.jb.Kb(a.Va);
            } catch (q) {
              throw new M(29);
            }
            if (void 0 === h && 0 === e) throw new M(6);
            if (null === h || void 0 === h) break;
            e++;
            b[c + g] = h;
          }
          e && (a.node.$a = Date.now());
          return e;
        }, write(a, b, c, d) {
          if (!a.Va || !a.Va.jb.Db) throw new M(60);
          try {
            for (var e = 0; e < d; e++) a.Va.jb.Db(a.Va, b[c + e]);
          } catch (g) {
            throw new M(29);
          }
          d && (a.node.Ua = a.node.Ta = Date.now());
          return e;
        } }, tb = { Kb() {
          a: {
            if (!fb.length) {
              var a = null;
              globalThis.window?.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
              if (!a) {
                var b = null;
                break a;
              }
              b = Array(gb(a) + 1);
              a = J(a, b, 0, b.length);
              b.length = a;
              fb = b;
            }
            b = fb.shift();
          }
          return b;
        }, Db(a, b) {
          null === b || 10 === b ? (Aa(db(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, kb(a) {
          0 < a.output?.length && (Aa(db(a.output)), a.output = []);
        }, oc() {
          return { ic: 25856, kc: 5, hc: 191, jc: 35387, fc: [
            3,
            28,
            127,
            21,
            4,
            0,
            1,
            0,
            17,
            19,
            26,
            0,
            18,
            15,
            23,
            22,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ] };
        }, pc() {
          return 0;
        }, qc() {
          return [24, 80];
        } }, ub = { Db(a, b) {
          null === b || 10 === b ? (B(db(a.output)), a.output = []) : 0 != b && a.output.push(b);
        }, kb(a) {
          0 < a.output?.length && (B(db(a.output)), a.output = []);
        } }, N = { Za: null, ab() {
          return N.createNode(null, "/", 16895, 0);
        }, createNode(a, b, c, d) {
          if (24576 === (c & 61440) || 4096 === (c & 61440)) throw new M(63);
          N.Za || (N.Za = { dir: { node: { Wa: N.La.Wa, Xa: N.La.Xa, lb: N.La.lb, qb: N.La.qb, Nb: N.La.Nb, wb: N.La.wb, ub: N.La.ub, Eb: N.La.Eb, vb: N.La.vb }, stream: { Ya: N.Ma.Ya } }, file: {
            node: { Wa: N.La.Wa, Xa: N.La.Xa },
            stream: { Ya: N.Ma.Ya, read: N.Ma.read, write: N.Ma.write, rb: N.Ma.rb, sb: N.Ma.sb }
          }, link: { node: { Wa: N.La.Wa, Xa: N.La.Xa, cb: N.La.cb }, stream: {} }, Ib: { node: { Wa: N.La.Wa, Xa: N.La.Xa }, stream: vb } });
          c = wb(a, b, c, d);
          O(c.mode) ? (c.La = N.Za.dir.node, c.Ma = N.Za.dir.stream, c.Na = {}) : 32768 === (c.mode & 61440) ? (c.La = N.Za.file.node, c.Ma = N.Za.file.stream, c.Ra = 0, c.Na = null) : 40960 === (c.mode & 61440) ? (c.La = N.Za.link.node, c.Ma = N.Za.link.stream) : 8192 === (c.mode & 61440) && (c.La = N.Za.Ib.node, c.Ma = N.Za.Ib.stream);
          c.$a = c.Ua = c.Ta = Date.now();
          a && (a.Na[b] = c, a.$a = a.Ua = a.Ta = c.$a);
          return c;
        }, nc(a) {
          return a.Na ? a.Na.subarray ? a.Na.subarray(0, a.Ra) : new Uint8Array(a.Na) : new Uint8Array(0);
        }, La: { Wa(a) {
          var b = {};
          b.Vb = 8192 === (a.mode & 61440) ? a.id : 1;
          b.$b = a.id;
          b.mode = a.mode;
          b.bc = 1;
          b.uid = 0;
          b.Zb = 0;
          b.mb = a.mb;
          O(a.mode) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.Ra : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
          b.$a = new Date(a.$a);
          b.Ua = new Date(a.Ua);
          b.Ta = new Date(a.Ta);
          b.Tb = 4096;
          b.Ub = Math.ceil(b.size / b.Tb);
          return b;
        }, Xa(a, b) {
          for (var c of ["mode", "atime", "mtime", "ctime"]) null != b[c] && (a[c] = b[c]);
          void 0 !== b.size && (b = b.size, a.Ra != b && (0 == b ? (a.Na = null, a.Ra = 0) : (c = a.Na, a.Na = new Uint8Array(b), c && a.Na.set(c.subarray(0, Math.min(b, a.Ra))), a.Ra = b)));
        }, lb() {
          N.yb || (N.yb = new M(44), N.yb.stack = "<generic error, no stack>");
          throw N.yb;
        }, qb(a, b, c, d) {
          return N.createNode(a, b, c, d);
        }, Nb(a, b, c) {
          try {
            var d = Q(b, c);
          } catch (g) {
          }
          if (d) {
            if (O(a.mode)) for (var e in d.Na) throw new M(55);
            xb(d);
          }
          delete a.parent.Na[a.name];
          b.Na[c] = a;
          a.name = c;
          b.Ta = b.Ua = a.parent.Ta = a.parent.Ua = Date.now();
        }, wb(a, b) {
          delete a.Na[b];
          a.Ta = a.Ua = Date.now();
        }, ub(a, b) {
          var c = Q(a, b), d;
          for (d in c.Na) throw new M(55);
          delete a.Na[b];
          a.Ta = a.Ua = Date.now();
        }, Eb(a) {
          return [".", "..", ...Object.keys(a.Na)];
        }, vb(a, b, c) {
          a = N.createNode(a, b, 41471, 0);
          a.link = c;
          return a;
        }, cb(a) {
          if (40960 !== (a.mode & 61440)) throw new M(28);
          return a.link;
        } }, Ma: { read(a, b, c, d, e) {
          var g = a.node.Na;
          if (e >= a.node.Ra) return 0;
          a = Math.min(a.node.Ra - e, d);
          if (8 < a && g.subarray) b.set(g.subarray(e, e + a), c);
          else for (d = 0; d < a; d++) b[c + d] = g[e + d];
          return a;
        }, write(a, b, c, d, e, g) {
          b.buffer === m.buffer && (g = false);
          if (!d) return 0;
          a = a.node;
          a.Ua = a.Ta = Date.now();
          if (b.subarray && (!a.Na || a.Na.subarray)) {
            if (g) return a.Na = b.subarray(c, c + d), a.Ra = d;
            if (0 === a.Ra && 0 === e) return a.Na = b.slice(c, c + d), a.Ra = d;
            if (e + d <= a.Ra) return a.Na.set(b.subarray(c, c + d), e), d;
          }
          g = e + d;
          var h = a.Na ? a.Na.length : 0;
          h >= g || (g = Math.max(g, h * (1048576 > h ? 2 : 1.125) >>> 0), 0 != h && (g = Math.max(g, 256)), h = a.Na, a.Na = new Uint8Array(g), 0 < a.Ra && a.Na.set(h.subarray(0, a.Ra), 0));
          if (a.Na.subarray && b.subarray) a.Na.set(b.subarray(c, c + d), e);
          else for (g = 0; g < d; g++) a.Na[e + g] = b[c + g];
          a.Ra = Math.max(
            a.Ra,
            e + d
          );
          return d;
        }, Ya(a, b, c) {
          1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.Ra);
          if (0 > b) throw new M(28);
          return b;
        }, rb(a, b, c, d, e) {
          if (32768 !== (a.node.mode & 61440)) throw new M(43);
          a = a.node.Na;
          if (e & 2 || !a || a.buffer !== m.buffer) {
            e = true;
            d = 65536 * Math.ceil(b / 65536);
            var g = yb(65536, d);
            g && C.fill(0, g, g + d);
            d = g;
            if (!d) throw new M(48);
            if (a) {
              if (0 < c || c + b < a.length) a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
              m.set(a, d);
            }
          } else e = false, d = a.byteOffset;
          return { dc: d, Ob: e };
        }, sb(a, b, c, d) {
          N.Ma.write(
            a,
            b,
            0,
            d,
            c,
            false
          );
          return 0;
        } } }, ia = (a, b) => {
          var c = 0;
          a && (c |= 365);
          b && (c |= 146);
          return c;
        }, zb = null, Ab = {}, Bb = [], Cb = 1, R = null, Db = false, Eb = true, Fb = {}, M = class {
          constructor(a) {
            __publicField(this, "name", "ErrnoError");
            this.Pa = a;
          }
        }, Gb = class {
          constructor() {
            __publicField(this, "pb", {});
            __publicField(this, "node", null);
          }
          get flags() {
            return this.pb.flags;
          }
          set flags(a) {
            this.pb.flags = a;
          }
          get position() {
            return this.pb.position;
          }
          set position(a) {
            this.pb.position = a;
          }
        }, Hb = class {
          constructor(a, b, c, d) {
            __publicField(this, "La", {});
            __publicField(this, "Ma", {});
            __publicField(this, "hb", null);
            a || (a = this);
            this.parent = a;
            this.ab = a.ab;
            this.id = Cb++;
            this.name = b;
            this.mode = c;
            this.mb = d;
            this.$a = this.Ua = this.Ta = Date.now();
          }
          get read() {
            return 365 === (this.mode & 365);
          }
          set read(a) {
            a ? this.mode |= 365 : this.mode &= -366;
          }
          get write() {
            return 146 === (this.mode & 146);
          }
          set write(a) {
            a ? this.mode |= 146 : this.mode &= -147;
          }
        };
        function S(a, b = {}) {
          if (!a) throw new M(44);
          b.Ab ?? (b.Ab = true);
          "/" === a.charAt(0) || (a = "//" + a);
          var c = 0;
          a: for (; 40 > c; c++) {
            a = a.split("/").filter((q) => !!q);
            for (var d = zb, e = "/", g = 0; g < a.length; g++) {
              var h = g === a.length - 1;
              if (h && b.parent) break;
              if ("." !== a[g]) if (".." === a[g]) if (e = Za(e), d === d.parent) {
                a = e + "/" + a.slice(g + 1).join("/");
                c--;
                continue a;
              } else d = d.parent;
              else {
                e = ha(e + "/" + a[g]);
                try {
                  d = Q(d, a[g]);
                } catch (q) {
                  if (44 === q?.Pa && h && b.cc) return { path: e };
                  throw q;
                }
                !d.hb || h && !b.Ab || (d = d.hb.root);
                if (40960 === (d.mode & 61440) && (!h || b.gb)) {
                  if (!d.La.cb) throw new M(52);
                  d = d.La.cb(d);
                  "/" === d.charAt(0) || (d = Za(e) + "/" + d);
                  a = d + "/" + a.slice(g + 1).join("/");
                  continue a;
                }
              }
            }
            return { path: e, node: d };
          }
          throw new M(32);
        }
        function fa(a) {
          for (var b; ; ) {
            if (a === a.parent) return a = a.ab.Mb, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
            b = b ? `${a.name}/${b}` : a.name;
            a = a.parent;
          }
        }
        function Ib(a, b) {
          for (var c = 0, d = 0; d < b.length; d++) c = (c << 5) - c + b.charCodeAt(d) | 0;
          return (a + c >>> 0) % R.length;
        }
        function xb(a) {
          var b = Ib(a.parent.id, a.name);
          if (R[b] === a) R[b] = a.ib;
          else for (b = R[b]; b; ) {
            if (b.ib === a) {
              b.ib = a.ib;
              break;
            }
            b = b.ib;
          }
        }
        function Q(a, b) {
          var c = O(a.mode) ? (c = Jb(a, "x")) ? c : a.La.lb ? 0 : 2 : 54;
          if (c) throw new M(c);
          for (c = R[Ib(a.id, b)]; c; c = c.ib) {
            var d = c.name;
            if (c.parent.id === a.id && d === b) return c;
          }
          return a.La.lb(a, b);
        }
        function wb(a, b, c, d) {
          a = new Hb(a, b, c, d);
          b = Ib(a.parent.id, a.name);
          a.ib = R[b];
          return R[b] = a;
        }
        function O(a) {
          return 16384 === (a & 61440);
        }
        function Kb(a) {
          var b = ["r", "w", "rw"][a & 3];
          a & 512 && (b += "w");
          return b;
        }
        function Jb(a, b) {
          if (Eb) return 0;
          if (!b.includes("r") || a.mode & 292) {
            if (b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73)) return 2;
          } else return 2;
          return 0;
        }
        function Lb(a, b) {
          if (!O(a.mode)) return 54;
          try {
            return Q(a, b), 20;
          } catch (c) {
          }
          return Jb(a, "wx");
        }
        function Mb(a, b, c) {
          try {
            var d = Q(a, b);
          } catch (e) {
            return e.Pa;
          }
          if (a = Jb(a, "wx")) return a;
          if (c) {
            if (!O(d.mode)) return 54;
            if (d === d.parent || "/" === fa(d)) return 10;
          } else if (O(d.mode)) return 31;
          return 0;
        }
        function Nb(a) {
          if (!a) throw new M(63);
          return a;
        }
        function T(a) {
          a = Bb[a];
          if (!a) throw new M(8);
          return a;
        }
        function Ob(a, b = -1) {
          a = Object.assign(new Gb(), a);
          if (-1 == b) a: {
            for (b = 0; 4096 >= b; b++) if (!Bb[b]) break a;
            throw new M(33);
          }
          a.bb = b;
          return Bb[b] = a;
        }
        function Pb(a, b = -1) {
          a = Ob(a, b);
          a.Ma?.mc?.(a);
          return a;
        }
        function Qb(a, b, c) {
          var d = a?.Ma.Xa;
          a = d ? a : b;
          d ?? (d = b.La.Xa);
          Nb(d);
          d(a, c);
        }
        var vb = { open(a) {
          a.Ma = Ab[a.node.mb].Ma;
          a.Ma.open?.(a);
        }, Ya() {
          throw new M(70);
        } };
        function rb(a, b) {
          Ab[a] = { Ma: b };
        }
        function Rb(a, b) {
          var c = "/" === b;
          if (c && zb) throw new M(10);
          if (!c && b) {
            var d = S(b, { Ab: false });
            b = d.path;
            d = d.node;
            if (d.hb) throw new M(10);
            if (!O(d.mode)) throw new M(54);
          }
          b = { type: a, rc: {}, Mb: b, ac: [] };
          a = a.ab(b);
          a.ab = b;
          b.root = a;
          c ? zb = a : d && (d.hb = b, d.ab && d.ab.ac.push(b));
        }
        function Sb(a, b, c) {
          var d = S(a, { parent: true }).node;
          a = $a(a);
          if (!a) throw new M(28);
          if ("." === a || ".." === a) throw new M(20);
          var e = Lb(d, a);
          if (e) throw new M(e);
          if (!d.La.qb) throw new M(63);
          return d.La.qb(d, a, b, c);
        }
        function ja(a, b = 438) {
          return Sb(a, b & 4095 | 32768, 0);
        }
        function U(a, b = 511) {
          return Sb(a, b & 1023 | 16384, 0);
        }
        function Tb(a, b, c) {
          "undefined" == typeof c && (c = b, b = 438);
          Sb(a, b | 8192, c);
        }
        function Ub(a, b) {
          if (!cb(a)) throw new M(44);
          var c = S(b, { parent: true }).node;
          if (!c) throw new M(44);
          b = $a(b);
          var d = Lb(c, b);
          if (d) throw new M(d);
          if (!c.La.vb) throw new M(63);
          c.La.vb(c, b, a);
        }
        function Vb(a) {
          var b = S(a, { parent: true }).node;
          a = $a(a);
          var c = Q(b, a), d = Mb(b, a, true);
          if (d) throw new M(d);
          if (!b.La.ub) throw new M(63);
          if (c.hb) throw new M(10);
          b.La.ub(b, a);
          xb(c);
        }
        function ta(a) {
          var b = S(a, { parent: true }).node;
          if (!b) throw new M(44);
          a = $a(a);
          var c = Q(b, a), d = Mb(b, a, false);
          if (d) throw new M(d);
          if (!b.La.wb) throw new M(63);
          if (c.hb) throw new M(10);
          b.La.wb(b, a);
          xb(c);
        }
        function Wb(a, b) {
          a = S(a, { gb: !b }).node;
          return Nb(a.La.Wa)(a);
        }
        function Xb(a, b, c, d) {
          Qb(a, b, { mode: c & 4095 | b.mode & -4096, Ta: Date.now(), Wb: d });
        }
        function ka(a, b) {
          a = "string" == typeof a ? S(a, { gb: true }).node : a;
          Xb(null, a, b);
        }
        function Yb(a, b, c) {
          if (O(b.mode)) throw new M(31);
          if (32768 !== (b.mode & 61440)) throw new M(28);
          var d = Jb(b, "w");
          if (d) throw new M(d);
          Qb(a, b, { size: c, timestamp: Date.now() });
        }
        function la(a, b, c = 438) {
          if ("" === a) throw new M(44);
          if ("string" == typeof b) {
            var d = { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 }[b];
            if ("undefined" == typeof d) throw Error(`Unknown file open mode: ${b}`);
            b = d;
          }
          c = b & 64 ? c & 4095 | 32768 : 0;
          if ("object" == typeof a) d = a;
          else {
            var e = a.endsWith("/");
            a = S(a, { gb: !(b & 131072), cc: true });
            d = a.node;
            a = a.path;
          }
          var g = false;
          if (b & 64) if (d) {
            if (b & 128) throw new M(20);
          } else {
            if (e) throw new M(31);
            d = Sb(a, c | 511, 0);
            g = true;
          }
          if (!d) throw new M(44);
          8192 === (d.mode & 61440) && (b &= -513);
          if (b & 65536 && !O(d.mode)) throw new M(54);
          if (!g && (e = d ? 40960 === (d.mode & 61440) ? 32 : O(d.mode) && ("r" !== Kb(b) || b & 576) ? 31 : Jb(d, Kb(b)) : 44)) throw new M(e);
          b & 512 && !g && (e = d, e = "string" == typeof e ? S(e, { gb: true }).node : e, Yb(null, e, 0));
          b &= -131713;
          e = Ob({ node: d, path: fa(d), flags: b, seekable: true, position: 0, Ma: d.Ma, ec: [], error: false });
          e.Ma.open && e.Ma.open(e);
          g && ka(d, c & 511);
          !l.logReadFiles || b & 1 || a in Fb || (Fb[a] = 1);
          return e;
        }
        function na(a) {
          if (null === a.bb) throw new M(8);
          a.Bb && (a.Bb = null);
          try {
            a.Ma.close && a.Ma.close(a);
          } catch (b) {
            throw b;
          } finally {
            Bb[a.bb] = null;
          }
          a.bb = null;
        }
        function Zb(a, b, c) {
          if (null === a.bb) throw new M(8);
          if (!a.seekable || !a.Ma.Ya) throw new M(70);
          if (0 != c && 1 != c && 2 != c) throw new M(28);
          a.position = a.Ma.Ya(a, b, c);
          a.ec = [];
        }
        function $b(a, b, c, d, e) {
          if (0 > d || 0 > e) throw new M(28);
          if (null === a.bb) throw new M(8);
          if (1 === (a.flags & 2097155)) throw new M(8);
          if (O(a.node.mode)) throw new M(31);
          if (!a.Ma.read) throw new M(28);
          var g = "undefined" != typeof e;
          if (!g) e = a.position;
          else if (!a.seekable) throw new M(70);
          b = a.Ma.read(a, b, c, d, e);
          g || (a.position += b);
          return b;
        }
        function ma(a, b, c, d, e) {
          if (0 > d || 0 > e) throw new M(28);
          if (null === a.bb) throw new M(8);
          if (0 === (a.flags & 2097155)) throw new M(8);
          if (O(a.node.mode)) throw new M(31);
          if (!a.Ma.write) throw new M(28);
          a.seekable && a.flags & 1024 && Zb(a, 0, 2);
          var g = "undefined" != typeof e;
          if (!g) e = a.position;
          else if (!a.seekable) throw new M(70);
          b = a.Ma.write(a, b, c, d, e, void 0);
          g || (a.position += b);
          return b;
        }
        function sa(a) {
          var b = b || 0;
          var c = "binary";
          "utf8" !== c && "binary" !== c && Ja(`Invalid encoding type "${c}"`);
          b = la(a, b);
          a = Wb(a).size;
          var d = new Uint8Array(a);
          $b(b, d, 0, a, 0);
          "utf8" === c && (d = db(d));
          na(b);
          return d;
        }
        function W(a, b, c) {
          a = ha("/dev/" + a);
          var d = ia(!!b, !!c);
          W.Lb ?? (W.Lb = 64);
          var e = W.Lb++ << 8 | 0;
          rb(e, { open(g) {
            g.seekable = false;
          }, close() {
            c?.buffer?.length && c(10);
          }, read(g, h, q, w) {
            for (var t = 0, x = 0; x < w; x++) {
              try {
                var D = b();
              } catch (ib) {
                throw new M(29);
              }
              if (void 0 === D && 0 === t) throw new M(6);
              if (null === D || void 0 === D) break;
              t++;
              h[q + x] = D;
            }
            t && (g.node.$a = Date.now());
            return t;
          }, write(g, h, q, w) {
            for (var t = 0; t < w; t++) try {
              c(h[q + t]);
            } catch (x) {
              throw new M(29);
            }
            w && (g.node.Ua = g.node.Ta = Date.now());
            return t;
          } });
          Tb(a, d, e);
        }
        var X = {};
        function Y(a, b, c) {
          if ("/" === b.charAt(0)) return b;
          a = -100 === a ? "/" : T(a).path;
          if (0 == b.length) {
            if (!c) throw new M(44);
            return a;
          }
          return a + "/" + b;
        }
        function ac(a, b) {
          F[a >> 2] = b.Vb;
          F[a + 4 >> 2] = b.mode;
          F[a + 8 >> 2] = b.bc;
          F[a + 12 >> 2] = b.uid;
          F[a + 16 >> 2] = b.Zb;
          F[a + 20 >> 2] = b.mb;
          H[a + 24 >> 3] = BigInt(b.size);
          E[a + 32 >> 2] = 4096;
          E[a + 36 >> 2] = b.Ub;
          var c = b.$a.getTime(), d = b.Ua.getTime(), e = b.Ta.getTime();
          H[a + 40 >> 3] = BigInt(Math.floor(c / 1e3));
          F[a + 48 >> 2] = c % 1e3 * 1e6;
          H[a + 56 >> 3] = BigInt(Math.floor(d / 1e3));
          F[a + 64 >> 2] = d % 1e3 * 1e6;
          H[a + 72 >> 3] = BigInt(Math.floor(e / 1e3));
          F[a + 80 >> 2] = e % 1e3 * 1e6;
          H[a + 88 >> 3] = BigInt(b.$b);
          return 0;
        }
        var kc = void 0, Cc = () => {
          var a = E[+kc >> 2];
          kc += 4;
          return a;
        }, Ec = 0, Fc = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Gc = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], Hc = {}, Ic = (a) => {
          if (!(a instanceof Pa || "unwind" == a)) throw a;
        }, Jc = (a) => {
          Da = a;
          Va || 0 < Ec || (l.onExit?.(a), Ca = true);
          throw new Pa(a);
        }, Kc = (a) => {
          if (!Ca) try {
            a();
          } catch (b) {
            Ic(b);
          } finally {
            if (!(Va || 0 < Ec)) try {
              Da = a = Da, Jc(a);
            } catch (b) {
              Ic(b);
            }
          }
        }, Lc = {}, Nc = () => {
          if (!Mc) {
            var a = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8", _: va || "./this.program" }, b;
            for (b in Lc) void 0 === Lc[b] ? delete a[b] : a[b] = Lc[b];
            var c = [];
            for (b in a) c.push(`${b}=${a[b]}`);
            Mc = c;
          }
          return Mc;
        }, Mc, Oc = (a, b, c, d) => {
          var e = { string: (t) => {
            var x = 0;
            if (null !== t && void 0 !== t && 0 !== t) {
              x = gb(t) + 1;
              var D = y(x);
              J(t, C, D, x);
              x = D;
            }
            return x;
          }, array: (t) => {
            var x = y(t.length);
            m.set(t, x);
            return x;
          } };
          a = l["_" + a];
          var g = [], h = 0;
          if (d) for (var q = 0; q < d.length; q++) {
            var w = e[c[q]];
            w ? (0 === h && (h = oa()), g[q] = w(d[q])) : g[q] = d[q];
          }
          c = a(...g);
          return c = function(t) {
            0 !== h && qa(h);
            return "string" === b ? z(t) : "boolean" === b ? !!t : t;
          }(c);
        }, ea = (a) => {
          var b = gb(a) + 1, c = ca(b);
          c && J(a, C, c, b);
          return c;
        }, Pc, Qc = [], A = (a) => {
          Pc.delete(Z.get(a));
          Z.set(a, null);
          Qc.push(a);
        }, Rc = (a) => {
          const b = a.length;
          return [b % 128 | 128, b >> 7, ...a];
        }, Sc = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 }, Tc = (a) => Rc(Array.from(a, (b) => Sc[b])), ua = (a, b) => {
          if (!Pc) {
            Pc = /* @__PURE__ */ new WeakMap();
            var c = Z.length;
            if (Pc) for (var d = 0; d < 0 + c; d++) {
              var e = Z.get(d);
              e && Pc.set(e, d);
            }
          }
          if (c = Pc.get(a) || 0) return c;
          c = Qc.length ? Qc.pop() : Z.grow(1);
          try {
            Z.set(c, a);
          } catch (g) {
            if (!(g instanceof TypeError)) throw g;
            b = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...Rc([1, 96, ...Tc(b.slice(1)), ...Tc("v" === b[0] ? "" : b[0])]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
            b = new WebAssembly.Module(b);
            b = new WebAssembly.Instance(b, { e: { f: a } }).exports.f;
            Z.set(c, b);
          }
          Pc.set(a, c);
          return c;
        };
        R = Array(4096);
        Rb(N, "/");
        U("/tmp");
        U("/home");
        U("/home/web_user");
        (function() {
          U("/dev");
          rb(259, { read: () => 0, write: (d, e, g, h) => h, Ya: () => 0 });
          Tb("/dev/null", 259);
          qb(1280, tb);
          qb(1536, ub);
          Tb("/dev/tty", 1280);
          Tb("/dev/tty1", 1536);
          var a = new Uint8Array(1024), b = 0, c = () => {
            0 === b && (bb(a), b = a.byteLength);
            return a[--b];
          };
          W("random", c);
          W("urandom", c);
          U("/dev/shm");
          U("/dev/shm/tmp");
        })();
        (function() {
          U("/proc");
          var a = U("/proc/self");
          U("/proc/self/fd");
          Rb({ ab() {
            var b = wb(a, "fd", 16895, 73);
            b.Ma = { Ya: N.Ma.Ya };
            b.La = { lb(c, d) {
              c = +d;
              var e = T(c);
              c = { parent: null, ab: { Mb: "fake" }, La: { cb: () => e.path }, id: c + 1 };
              return c.parent = c;
            }, Eb() {
              return Array.from(Bb.entries()).filter(([, c]) => c).map(([c]) => c.toString());
            } };
            return b;
          } }, "/proc/self/fd");
        })();
        l.noExitRuntime && (Va = l.noExitRuntime);
        l.print && (Aa = l.print);
        l.printErr && (B = l.printErr);
        l.wasmBinary && (Ba = l.wasmBinary);
        l.thisProgram && (va = l.thisProgram);
        if (l.preInit) for ("function" == typeof l.preInit && (l.preInit = [l.preInit]); 0 < l.preInit.length; ) l.preInit.shift()();
        l.stackSave = () => oa();
        l.stackRestore = (a) => qa(a);
        l.stackAlloc = (a) => y(a);
        l.cwrap = (a, b, c, d) => {
          var e = !c || c.every((g) => "number" === g || "boolean" === g);
          return "string" !== b && e && !d ? l["_" + a] : (...g) => Oc(a, b, c, g);
        };
        l.addFunction = ua;
        l.removeFunction = A;
        l.UTF8ToString = z;
        l.stringToNewUTF8 = ea;
        l.writeArrayToMemory = (a, b) => {
          m.set(a, b);
        };
        var ca, da, yb, Uc, qa, y, oa, Ia, Z, Vc = {
          a: (a, b, c, d) => Ja(`Assertion failed: ${z(a)}, at: ` + [b ? z(b) : "unknown filename", c, d ? z(d) : "unknown function"]),
          i: function(a, b) {
            try {
              return a = z(a), ka(a, b), 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          L: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b);
              if (c & -8) return -28;
              var d = S(b, { gb: true }).node;
              if (!d) return -44;
              a = "";
              c & 4 && (a += "r");
              c & 2 && (a += "w");
              c & 1 && (a += "x");
              return a && Jb(d, a) ? -2 : 0;
            } catch (e) {
              if ("undefined" == typeof X || "ErrnoError" !== e.name) throw e;
              return -e.Pa;
            }
          },
          j: function(a, b) {
            try {
              var c = T(a);
              Xb(c, c.node, b, false);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          h: function(a) {
            try {
              var b = T(a);
              Qb(b, b.node, { timestamp: Date.now(), Wb: false });
              return 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          b: function(a, b, c) {
            kc = c;
            try {
              var d = T(a);
              switch (b) {
                case 0:
                  var e = Cc();
                  if (0 > e) break;
                  for (; Bb[e]; ) e++;
                  return Pb(d, e).bb;
                case 1:
                case 2:
                  return 0;
                case 3:
                  return d.flags;
                case 4:
                  return e = Cc(), d.flags |= e, 0;
                case 12:
                  return e = Cc(), Ea[e + 0 >> 1] = 2, 0;
                case 13:
                case 14:
                  return 0;
              }
              return -28;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          g: function(a, b) {
            try {
              var c = T(a), d = c.node, e = c.Ma.Wa;
              a = e ? c : d;
              e ?? (e = d.La.Wa);
              Nb(e);
              var g = e(a);
              return ac(b, g);
            } catch (h) {
              if ("undefined" == typeof X || "ErrnoError" !== h.name) throw h;
              return -h.Pa;
            }
          },
          H: function(a, b) {
            b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
            try {
              if (isNaN(b)) return -61;
              var c = T(a);
              if (0 > b || 0 === (c.flags & 2097155)) throw new M(28);
              Yb(c, c.node, b);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          G: function(a, b) {
            try {
              if (0 === b) return -28;
              var c = gb("/") + 1;
              if (b < c) return -68;
              J("/", C, a, b);
              return c;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          K: function(a, b) {
            try {
              return a = z(a), ac(b, Wb(a, true));
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          C: function(a, b, c) {
            try {
              return b = z(b), b = Y(a, b), U(b, c), 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          J: function(a, b, c, d) {
            try {
              b = z(b);
              var e = d & 256;
              b = Y(a, b, d & 4096);
              return ac(c, e ? Wb(b, true) : Wb(b));
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          x: function(a, b, c, d) {
            kc = d;
            try {
              b = z(b);
              b = Y(a, b);
              var e = d ? Cc() : 0;
              return la(b, c, e).bb;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return -g.Pa;
            }
          },
          v: function(a, b, c, d) {
            try {
              b = z(b);
              b = Y(a, b);
              if (0 >= d) return -28;
              var e = S(b).node;
              if (!e) throw new M(44);
              if (!e.La.cb) throw new M(28);
              var g = e.La.cb(e);
              var h = Math.min(d, gb(g)), q = m[c + h];
              J(g, C, c, d + 1);
              m[c + h] = q;
              return h;
            } catch (w) {
              if ("undefined" == typeof X || "ErrnoError" !== w.name) throw w;
              return -w.Pa;
            }
          },
          u: function(a) {
            try {
              return a = z(a), Vb(a), 0;
            } catch (b) {
              if ("undefined" == typeof X || "ErrnoError" !== b.name) throw b;
              return -b.Pa;
            }
          },
          f: function(a, b) {
            try {
              return a = z(a), ac(b, Wb(a));
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return -c.Pa;
            }
          },
          r: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b);
              if (c) if (512 === c) Vb(b);
              else return -28;
              else ta(b);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return -d.Pa;
            }
          },
          q: function(a, b, c) {
            try {
              b = z(b);
              b = Y(a, b, true);
              var d = Date.now(), e, g;
              if (c) {
                var h = F[c >> 2] + 4294967296 * E[c + 4 >> 2], q = E[c + 8 >> 2];
                1073741823 == q ? e = d : 1073741822 == q ? e = null : e = 1e3 * h + q / 1e6;
                c += 16;
                h = F[c >> 2] + 4294967296 * E[c + 4 >> 2];
                q = E[c + 8 >> 2];
                1073741823 == q ? g = d : 1073741822 == q ? g = null : g = 1e3 * h + q / 1e6;
              } else g = e = d;
              if (null !== (g ?? e)) {
                a = e;
                var w = S(b, { gb: true }).node;
                Nb(w.La.Xa)(w, { $a: a, Ua: g });
              }
              return 0;
            } catch (t) {
              if ("undefined" == typeof X || "ErrnoError" !== t.name) throw t;
              return -t.Pa;
            }
          },
          m: () => Ja(""),
          l: () => {
            Va = false;
            Ec = 0;
          },
          A: function(a, b) {
            a = -9007199254740992 > a || 9007199254740992 < a ? NaN : Number(a);
            a = new Date(1e3 * a);
            E[b >> 2] = a.getSeconds();
            E[b + 4 >> 2] = a.getMinutes();
            E[b + 8 >> 2] = a.getHours();
            E[b + 12 >> 2] = a.getDate();
            E[b + 16 >> 2] = a.getMonth();
            E[b + 20 >> 2] = a.getFullYear() - 1900;
            E[b + 24 >> 2] = a.getDay();
            var c = a.getFullYear();
            E[b + 28 >> 2] = (0 !== c % 4 || 0 === c % 100 && 0 !== c % 400 ? Gc : Fc)[a.getMonth()] + a.getDate() - 1 | 0;
            E[b + 36 >> 2] = -(60 * a.getTimezoneOffset());
            c = new Date(a.getFullYear(), 6, 1).getTimezoneOffset();
            var d = new Date(a.getFullYear(), 0, 1).getTimezoneOffset();
            E[b + 32 >> 2] = (c != d && a.getTimezoneOffset() == Math.min(d, c)) | 0;
          },
          y: function(a, b, c, d, e, g, h) {
            e = -9007199254740992 > e || 9007199254740992 < e ? NaN : Number(e);
            try {
              var q = T(d);
              if (0 !== (b & 2) && 0 === (c & 2) && 2 !== (q.flags & 2097155)) throw new M(2);
              if (1 === (q.flags & 2097155)) throw new M(2);
              if (!q.Ma.rb) throw new M(43);
              if (!a) throw new M(28);
              var w = q.Ma.rb(q, a, e, b, c);
              var t = w.dc;
              E[g >> 2] = w.Ob;
              F[h >> 2] = t;
              return 0;
            } catch (x) {
              if ("undefined" == typeof X || "ErrnoError" !== x.name) throw x;
              return -x.Pa;
            }
          },
          z: function(a, b, c, d, e, g) {
            g = -9007199254740992 > g || 9007199254740992 < g ? NaN : Number(g);
            try {
              var h = T(e);
              if (c & 2) {
                if (32768 !== (h.node.mode & 61440)) throw new M(43);
                d & 2 || h.Ma.sb && h.Ma.sb(h, C.slice(a, a + b), g, b, d);
              }
            } catch (q) {
              if ("undefined" == typeof X || "ErrnoError" !== q.name) throw q;
              return -q.Pa;
            }
          },
          n: (a, b) => {
            Hc[a] && (clearTimeout(Hc[a].id), delete Hc[a]);
            if (!b) return 0;
            var c = setTimeout(() => {
              delete Hc[a];
              Kc(() => Uc(a, performance.now()));
            }, b);
            Hc[a] = { id: c, sc: b };
            return 0;
          },
          B: (a, b, c, d) => {
            var e = (/* @__PURE__ */ new Date()).getFullYear(), g = new Date(e, 0, 1).getTimezoneOffset();
            e = new Date(e, 6, 1).getTimezoneOffset();
            F[a >> 2] = 60 * Math.max(g, e);
            E[b >> 2] = Number(g != e);
            b = (h) => {
              var q = Math.abs(h);
              return `UTC${0 <= h ? "-" : "+"}${String(Math.floor(q / 60)).padStart(2, "0")}${String(q % 60).padStart(2, "0")}`;
            };
            a = b(g);
            b = b(e);
            e < g ? (J(a, C, c, 17), J(b, C, d, 17)) : (J(a, C, d, 17), J(b, C, c, 17));
          },
          d: () => Date.now(),
          s: () => 2147483648,
          c: () => performance.now(),
          o: (a) => {
            var b = C.length;
            a >>>= 0;
            if (2147483648 < a) return false;
            for (var c = 1; 4 >= c; c *= 2) {
              var d = b * (1 + 0.2 / c);
              d = Math.min(d, a + 100663296);
              a: {
                d = (Math.min(2147483648, 65536 * Math.ceil(Math.max(a, d) / 65536)) - Ia.buffer.byteLength + 65535) / 65536 | 0;
                try {
                  Ia.grow(d);
                  Ha();
                  var e = 1;
                  break a;
                } catch (g) {
                }
                e = void 0;
              }
              if (e) return true;
            }
            return false;
          },
          E: (a, b) => {
            var c = 0, d = 0, e;
            for (e of Nc()) {
              var g = b + c;
              F[a + d >> 2] = g;
              c += J(e, C, g, Infinity) + 1;
              d += 4;
            }
            return 0;
          },
          F: (a, b) => {
            var c = Nc();
            F[a >> 2] = c.length;
            a = 0;
            for (var d of c) a += gb(d) + 1;
            F[b >> 2] = a;
            return 0;
          },
          e: function(a) {
            try {
              var b = T(a);
              na(b);
              return 0;
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return c.Pa;
            }
          },
          p: function(a, b) {
            try {
              var c = T(a);
              m[b] = c.Va ? 2 : O(c.mode) ? 3 : 40960 === (c.mode & 61440) ? 7 : 4;
              Ea[b + 2 >> 1] = 0;
              H[b + 8 >> 3] = BigInt(0);
              H[b + 16 >> 3] = BigInt(0);
              return 0;
            } catch (d) {
              if ("undefined" == typeof X || "ErrnoError" !== d.name) throw d;
              return d.Pa;
            }
          },
          w: function(a, b, c, d) {
            try {
              a: {
                var e = T(a);
                a = b;
                for (var g, h = b = 0; h < c; h++) {
                  var q = F[a >> 2], w = F[a + 4 >> 2];
                  a += 8;
                  var t = $b(e, m, q, w, g);
                  if (0 > t) {
                    var x = -1;
                    break a;
                  }
                  b += t;
                  if (t < w) break;
                  "undefined" != typeof g && (g += t);
                }
                x = b;
              }
              F[d >> 2] = x;
              return 0;
            } catch (D) {
              if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
              return D.Pa;
            }
          },
          D: function(a, b, c, d) {
            b = -9007199254740992 > b || 9007199254740992 < b ? NaN : Number(b);
            try {
              if (isNaN(b)) return 61;
              var e = T(a);
              Zb(e, b, c);
              H[d >> 3] = BigInt(e.position);
              e.Bb && 0 === b && 0 === c && (e.Bb = null);
              return 0;
            } catch (g) {
              if ("undefined" == typeof X || "ErrnoError" !== g.name) throw g;
              return g.Pa;
            }
          },
          I: function(a) {
            try {
              var b = T(a);
              return b.Ma?.kb?.(b);
            } catch (c) {
              if ("undefined" == typeof X || "ErrnoError" !== c.name) throw c;
              return c.Pa;
            }
          },
          t: function(a, b, c, d) {
            try {
              a: {
                var e = T(a);
                a = b;
                for (var g, h = b = 0; h < c; h++) {
                  var q = F[a >> 2], w = F[a + 4 >> 2];
                  a += 8;
                  var t = ma(e, m, q, w, g);
                  if (0 > t) {
                    var x = -1;
                    break a;
                  }
                  b += t;
                  if (t < w) break;
                  "undefined" != typeof g && (g += t);
                }
                x = b;
              }
              F[d >> 2] = x;
              return 0;
            } catch (D) {
              if ("undefined" == typeof X || "ErrnoError" !== D.name) throw D;
              return D.Pa;
            }
          },
          k: Jc
        };
        function Wc() {
          function a() {
            l.calledRun = true;
            if (!Ca) {
              if (!l.noFSInit && !Db) {
                var b, c;
                Db = true;
                b ?? (b = l.stdin);
                c ?? (c = l.stdout);
                d ?? (d = l.stderr);
                b ? W("stdin", b) : Ub("/dev/tty", "/dev/stdin");
                c ? W("stdout", null, c) : Ub("/dev/tty", "/dev/stdout");
                d ? W("stderr", null, d) : Ub("/dev/tty1", "/dev/stderr");
                la("/dev/stdin", 0);
                la("/dev/stdout", 1);
                la("/dev/stderr", 1);
              }
              Xc.N();
              Eb = false;
              l.onRuntimeInitialized?.();
              if (l.postRun) for ("function" == typeof l.postRun && (l.postRun = [l.postRun]); l.postRun.length; ) {
                var d = l.postRun.shift();
                Ra.push(d);
              }
              Qa(Ra);
            }
          }
          if (0 < I) Ua = Wc;
          else {
            if (l.preRun) for ("function" == typeof l.preRun && (l.preRun = [l.preRun]); l.preRun.length; ) Ta();
            Qa(Sa);
            0 < I ? Ua = Wc : l.setStatus ? (l.setStatus("Running..."), setTimeout(() => {
              setTimeout(() => l.setStatus(""), 1);
              a();
            }, 1)) : a();
          }
        }
        var Xc;
        (async function() {
          function a(c) {
            c = Xc = c.exports;
            l._sqlite3_free = c.P;
            l._sqlite3_value_text = c.Q;
            l._sqlite3_prepare_v2 = c.R;
            l._sqlite3_step = c.S;
            l._sqlite3_reset = c.T;
            l._sqlite3_exec = c.U;
            l._sqlite3_finalize = c.V;
            l._sqlite3_column_name = c.W;
            l._sqlite3_column_text = c.X;
            l._sqlite3_column_type = c.Y;
            l._sqlite3_errmsg = c.Z;
            l._sqlite3_clear_bindings = c._;
            l._sqlite3_value_blob = c.$;
            l._sqlite3_value_bytes = c.aa;
            l._sqlite3_value_double = c.ba;
            l._sqlite3_value_int = c.ca;
            l._sqlite3_value_type = c.da;
            l._sqlite3_result_blob = c.ea;
            l._sqlite3_result_double = c.fa;
            l._sqlite3_result_error = c.ga;
            l._sqlite3_result_int = c.ha;
            l._sqlite3_result_int64 = c.ia;
            l._sqlite3_result_null = c.ja;
            l._sqlite3_result_text = c.ka;
            l._sqlite3_aggregate_context = c.la;
            l._sqlite3_column_count = c.ma;
            l._sqlite3_data_count = c.na;
            l._sqlite3_column_blob = c.oa;
            l._sqlite3_column_bytes = c.pa;
            l._sqlite3_column_double = c.qa;
            l._sqlite3_bind_blob = c.ra;
            l._sqlite3_bind_double = c.sa;
            l._sqlite3_bind_int = c.ta;
            l._sqlite3_bind_text = c.ua;
            l._sqlite3_bind_parameter_index = c.va;
            l._sqlite3_sql = c.wa;
            l._sqlite3_normalized_sql = c.xa;
            l._sqlite3_changes = c.ya;
            l._sqlite3_close_v2 = c.za;
            l._sqlite3_create_function_v2 = c.Aa;
            l._sqlite3_update_hook = c.Ba;
            l._sqlite3_open = c.Ca;
            ca = l._malloc = c.Da;
            da = l._free = c.Ea;
            l._RegisterExtensionFunctions = c.Fa;
            yb = c.Ga;
            Uc = c.Ha;
            qa = c.Ia;
            y = c.Ja;
            oa = c.Ka;
            Ia = c.M;
            Z = c.O;
            Ha();
            I--;
            l.monitorRunDependencies?.(I);
            0 == I && Ua && (c = Ua, Ua = null, c());
            return Xc;
          }
          I++;
          l.monitorRunDependencies?.(I);
          var b = { a: Vc };
          if (l.instantiateWasm) return new Promise((c) => {
            l.instantiateWasm(b, (d, e) => {
              c(a(d, e));
            });
          });
          La ?? (La = l.locateFile ? l.locateFile("sql-wasm-browser.wasm", xa) : xa + "sql-wasm-browser.wasm");
          return a((await Oa(b)).instance);
        })();
        Wc();
        return Module;
      });
      return initSqlJsPromise;
    };
    if (typeof exports === "object" && typeof module === "object") {
      module.exports = initSqlJs2;
      module.exports.default = initSqlJs2;
    } else if (typeof define === "function" && define["amd"]) {
      define([], function() {
        return initSqlJs2;
      });
    } else if (typeof exports === "object") {
      exports["Module"] = initSqlJs2;
    }
  }
});

// src/types.ts
function isConflict(result) {
  return result.conflict;
}

// src/config/extractor.ts
function resolvePath(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (typeof current !== "object") {
      return void 0;
    }
    current = current[part];
  }
  return current;
}
function applyTransform(value, transform) {
  if (!transform) {
    return value;
  }
  switch (transform) {
    case "LOWER":
      return value.toLowerCase();
    case "UPPER":
      return value.toUpperCase();
    case "MONTH": {
      const match = value.match(/^(\d{4}-\d{2})/);
      if (!match) {
        throw new Error(`Cannot extract MONTH from value: ${value}`);
      }
      return match[1];
    }
    case "YEAR": {
      const match = value.match(/^(\d{4})/);
      if (!match) {
        throw new Error(`Cannot extract YEAR from value: ${value}`);
      }
      return match[1];
    }
    case "DATE": {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!match) {
        throw new Error(`Cannot extract DATE from value: ${value}`);
      }
      return match[1];
    }
    default:
      throw new Error(`Unknown transform: ${transform}`);
  }
}
var KeyExtractionError = class extends Error {
  constructor(eventType, keyName, path, message) {
    super(`Key extraction failed for ${eventType}.${keyName} (path: ${path}): ${message}`);
    this.eventType = eventType;
    this.keyName = keyName;
    this.path = path;
    this.name = "KeyExtractionError";
  }
};
var KeyExtractor = class {
  constructor(config) {
    this.config = config;
  }
  /**
   * Extract all consistency keys from an event
   */
  extract(event) {
    const eventConfig = this.config.eventTypes[event.type];
    if (!eventConfig) {
      return [];
    }
    const keys = [];
    for (const keyDef of eventConfig.keys) {
      const rawValue = resolvePath(event, keyDef.path);
      if (rawValue === null || rawValue === void 0) {
        const handling = keyDef.nullHandling ?? "error";
        switch (handling) {
          case "skip":
            continue;
          case "default":
            if (keyDef.defaultValue === void 0) {
              throw new KeyExtractionError(
                event.type,
                keyDef.name,
                keyDef.path,
                'nullHandling is "default" but no defaultValue provided'
              );
            }
            keys.push({ name: keyDef.name, value: keyDef.defaultValue });
            continue;
          case "error":
          default:
            throw new KeyExtractionError(
              event.type,
              keyDef.name,
              keyDef.path,
              "Path resolved to null/undefined"
            );
        }
      }
      let stringValue;
      if (typeof rawValue === "string") {
        stringValue = rawValue;
      } else if (typeof rawValue === "number" || typeof rawValue === "bigint") {
        stringValue = String(rawValue);
      } else if (typeof rawValue === "boolean") {
        stringValue = rawValue ? "true" : "false";
      } else {
        throw new KeyExtractionError(
          event.type,
          keyDef.name,
          keyDef.path,
          `Cannot convert value of type ${typeof rawValue} to string`
        );
      }
      const finalValue = applyTransform(stringValue, keyDef.transform);
      keys.push({ name: keyDef.name, value: finalValue });
    }
    return keys;
  }
};

// src/config/validator.ts
var ConfigValidationError = class extends Error {
  constructor(errors) {
    super(`Configuration validation failed:
${errors.map((e) => `  - ${e}`).join("\n")}`);
    this.errors = errors;
    this.name = "ConfigValidationError";
  }
};
var VALID_TRANSFORMS = ["LOWER", "UPPER", "MONTH", "YEAR", "DATE"];
var VALID_NULL_HANDLING = ["error", "skip", "default"];
var KEY_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
var PATH_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
function validateKeyDef(eventType, keyDef, index) {
  const errors = [];
  const prefix = `eventTypes.${eventType}.keys[${index}]`;
  if (!keyDef.name) {
    errors.push(`${prefix}.name is required`);
  } else if (!KEY_NAME_PATTERN.test(keyDef.name)) {
    errors.push(
      `${prefix}.name "${keyDef.name}" must match pattern ${KEY_NAME_PATTERN}`
    );
  }
  if (!keyDef.path) {
    errors.push(`${prefix}.path is required`);
  } else if (!PATH_PATTERN.test(keyDef.path)) {
    errors.push(
      `${prefix}.path "${keyDef.path}" must be a valid dot-notation path`
    );
  }
  if (keyDef.transform !== void 0) {
    if (!VALID_TRANSFORMS.includes(keyDef.transform)) {
      errors.push(
        `${prefix}.transform "${keyDef.transform}" must be one of: ${VALID_TRANSFORMS.join(", ")}`
      );
    }
  }
  if (keyDef.nullHandling !== void 0) {
    if (!VALID_NULL_HANDLING.includes(keyDef.nullHandling)) {
      errors.push(
        `${prefix}.nullHandling "${keyDef.nullHandling}" must be one of: ${VALID_NULL_HANDLING.join(", ")}`
      );
    }
    if (keyDef.nullHandling === "default" && keyDef.defaultValue === void 0) {
      errors.push(
        `${prefix}.defaultValue is required when nullHandling is "default"`
      );
    }
  }
  return errors;
}
function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") {
    throw new ConfigValidationError(["Configuration must be an object"]);
  }
  if (!config.eventTypes || typeof config.eventTypes !== "object") {
    throw new ConfigValidationError(["eventTypes must be an object"]);
  }
  for (const [eventType, eventConfig] of Object.entries(config.eventTypes)) {
    if (!eventConfig || typeof eventConfig !== "object") {
      errors.push(`eventTypes.${eventType} must be an object`);
      continue;
    }
    if (!Array.isArray(eventConfig.keys)) {
      errors.push(`eventTypes.${eventType}.keys must be an array`);
      continue;
    }
    const keyNames = /* @__PURE__ */ new Set();
    for (let i = 0; i < eventConfig.keys.length; i++) {
      const keyDef = eventConfig.keys[i];
      errors.push(...validateKeyDef(eventType, keyDef, i));
      if (keyDef.name && keyNames.has(keyDef.name)) {
        errors.push(
          `eventTypes.${eventType}.keys has duplicate key name "${keyDef.name}"`
        );
      }
      keyNames.add(keyDef.name);
    }
  }
  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}

// src/storage/sqljs.ts
var import_sql = __toESM(require_sql_wasm_browser(), 1);
var SCHEMA = `
-- Events (Append-Only Log)
CREATE TABLE IF NOT EXISTS events (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Consistency Key Index (populated by store on write)
CREATE TABLE IF NOT EXISTS event_keys (
  position INTEGER NOT NULL,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  PRIMARY KEY (position, key_name, key_value),
  FOREIGN KEY (position) REFERENCES events(position)
);

-- Metadata (for config hash, etc.)
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indices for fast queries
CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_key ON event_keys(key_name, key_value);
CREATE INDEX IF NOT EXISTS idx_key_position ON event_keys(key_name, key_value, position);
`;
var SqlJsStorage = class {
  constructor(options = {}) {
    __publicField(this, "db", null);
    __publicField(this, "initPromise");
    this.initPromise = this.initialize(options);
  }
  async initialize(options) {
    const SQL = await (0, import_sql.default)({
      locateFile: (file) => {
        if (options.wasmUrl) return options.wasmUrl;
        return `https://sql.js.org/dist/${file}`;
      }
    });
    if (options.data) {
      this.db = new SQL.Database(new Uint8Array(options.data));
    } else {
      this.db = new SQL.Database();
    }
    this.db.run(SCHEMA);
  }
  async ensureInitialized() {
    await this.initPromise;
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }
  async append(eventsToStore, keys) {
    console.log("\u{1F7E3} [SqlJsStorage.append] Called with eventsToStore:", JSON.stringify(eventsToStore, (k, v) => k === "timestamp" ? v?.toISOString?.() ?? v : v));
    const db = await this.ensureInitialized();
    if (eventsToStore.length !== keys.length) {
      throw new Error("Events and keys arrays must have the same length");
    }
    if (eventsToStore.length === 0) {
      return this.getLatestPosition();
    }
    let lastPosition = 0n;
    db.run("BEGIN TRANSACTION");
    try {
      for (let i = 0; i < eventsToStore.length; i++) {
        const event = eventsToStore[i];
        console.log(`\u{1F7E3} [SqlJsStorage.append] Event ${i} raw:`, event);
        console.log(`\u{1F7E3} [SqlJsStorage.append] Event ${i} id:`, event.id, "type:", typeof event.id);
        const eventKeys = keys[i];
        const eventId = String(event.id);
        const eventType = String(event.type);
        const eventData = JSON.stringify(event.data);
        const eventMeta = event.metadata ? JSON.stringify(event.metadata) : null;
        const eventTime = event.timestamp.toISOString();
        console.log(`\u{1F7E3} [SqlJsStorage.append] After String(): eventId="${eventId}"`);
        console.log(`\u{1F7E3} [SqlJsStorage.append] eventId length:`, eventId.length);
        console.log("[SqlJsStorage] Inserting:", { eventId, eventType, eventData });
        if (!eventId || eventId === "undefined" || eventId === "null") {
          throw new Error(`[SqlJsStorage] Invalid event ID: "${eventId}"`);
        }
        const escapeSql = (s) => {
          if (s === null) return "NULL";
          return "'" + s.replace(/'/g, "''") + "'";
        };
        const sql = `INSERT INTO events (event_id, event_type, data, metadata, timestamp)
           VALUES (${escapeSql(eventId)}, ${escapeSql(eventType)}, ${escapeSql(eventData)}, ${eventMeta === null ? "NULL" : escapeSql(eventMeta)}, ${escapeSql(eventTime)})`;
        console.log("[SqlJsStorage] SQL:", sql.substring(0, 200));
        db.run(sql);
        const result = db.exec("SELECT last_insert_rowid() as position");
        console.log("[SqlJsStorage] last_insert_rowid result:", JSON.stringify(result));
        const position = BigInt(result[0].values[0][0]);
        console.log("[SqlJsStorage] position:", position.toString());
        lastPosition = position;
        for (const key of eventKeys) {
          const keySql = `INSERT INTO event_keys (position, key_name, key_value) VALUES (${Number(position)}, ${escapeSql(key.name)}, ${escapeSql(key.value)})`;
          console.log("[SqlJsStorage] Key SQL:", keySql);
          db.run(keySql);
        }
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
    return lastPosition;
  }
  async query(conditions, fromPosition, limit) {
    const db = await this.ensureInitialized();
    if (conditions.length === 0) {
      return [];
    }
    const whereClauses = conditions.map(
      () => "(e.event_type = ? AND k.key_name = ? AND k.key_value = ?)"
    );
    const whereParams = conditions.flatMap((c) => [c.type, c.key, c.value]);
    let sql = `
      SELECT DISTINCT
        e.position,
        e.event_id,
        e.event_type,
        e.data,
        e.metadata,
        e.timestamp
      FROM events e
      JOIN event_keys k ON e.position = k.position
      WHERE (${whereClauses.join(" OR ")})
    `;
    const params = [...whereParams];
    if (fromPosition !== void 0) {
      sql += " AND e.position > ?";
      params.push(Number(fromPosition));
    }
    sql += " ORDER BY e.position";
    if (limit !== void 0) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    const rows = result[0].values;
    return rows.map((row) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return this.rowToEvent(obj);
    });
  }
  async getEventsSince(conditions, sincePosition) {
    return this.query(conditions, sincePosition);
  }
  async getLatestPosition() {
    const db = await this.ensureInitialized();
    const result = db.exec("SELECT MAX(position) as pos FROM events");
    if (result.length === 0 || result[0].values[0][0] === null) {
      return 0n;
    }
    return BigInt(result[0].values[0][0]);
  }
  async close() {
    const db = await this.ensureInitialized();
    db.close();
    this.db = null;
  }
  // --- UI Helper Methods (not part of core DCB API) ---
  /**
   * Get all events (for debugging/UI)
   */
  async getAllEvents() {
    const db = await this.ensureInitialized();
    const result = db.exec(`
      SELECT position, event_id, event_type, data, metadata, timestamp
      FROM events
      ORDER BY position ASC
    `);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    const rows = result[0].values;
    return rows.map((row) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return this.rowToEvent(obj);
    });
  }
  /**
   * Get all keys (for debugging/UI)
   */
  async getAllKeys() {
    const db = await this.ensureInitialized();
    const result = db.exec(`
      SELECT position, key_name, key_value
      FROM event_keys
      ORDER BY position ASC
    `);
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      position: row[0],
      key_name: row[1],
      key_value: row[2]
    }));
  }
  /**
   * Clear all data (for testing)
   */
  async clear() {
    const db = await this.ensureInitialized();
    db.run("DELETE FROM event_keys");
    db.run("DELETE FROM events");
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('events', 'event_keys')");
  }
  /**
   * Export database as Uint8Array for persistence
   */
  async export() {
    const db = await this.ensureInitialized();
    return db.export();
  }
  // --- Metadata Methods ---
  /**
   * Get stored config hash
   */
  async getConfigHash() {
    const db = await this.ensureInitialized();
    const result = db.exec("SELECT value FROM metadata WHERE key = 'config_hash'");
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return result[0].values[0][0];
  }
  /**
   * Set config hash
   */
  async setConfigHash(hash) {
    if (!hash) {
      console.warn("[SqlJsStorage] setConfigHash called with empty hash, skipping");
      return;
    }
    const db = await this.ensureInitialized();
    db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('config_hash', ?)",
      [hash]
    );
  }
  /**
   * Reindex all events with new keys
   */
  async reindex(extractKeys) {
    const db = await this.ensureInitialized();
    const events = await this.getAllEvents();
    db.run("BEGIN TRANSACTION");
    try {
      db.run("DELETE FROM event_keys");
      for (const event of events) {
        const keys = extractKeys(event);
        for (const key of keys) {
          db.run(
            "INSERT INTO event_keys (position, key_name, key_value) VALUES (?, ?, ?)",
            [Number(event.position), key.name, key.value]
          );
        }
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
  }
  rowToEvent(row) {
    return {
      id: row.event_id,
      type: row.event_type,
      data: JSON.parse(row.data),
      metadata: row.metadata ? JSON.parse(row.metadata) : void 0,
      timestamp: new Date(row.timestamp),
      position: BigInt(row.position)
    };
  }
};

// src/token.browser.ts
function base64urlEncode(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(data) {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}
async function hmacSha256(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(signature);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
function normalizeQuery(conditions) {
  return conditions.map((c) => ({ type: c.type, key: c.key, value: c.value })).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return a.value.localeCompare(b.value);
  });
}
async function createToken(query, position, secret) {
  const payload = {
    v: 1,
    pos: position.toString(),
    ts: Math.floor(Date.now() / 1e3),
    q: normalizeQuery(query.conditions)
  };
  const payloadJson = JSON.stringify(payload);
  const sig = await hmacSha256(secret, payloadJson);
  return base64urlEncode(payloadJson) + "." + base64urlEncode(sig);
}
var TokenValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TokenValidationError";
  }
};
async function validateToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new TokenValidationError("Invalid token format: expected two parts separated by dot");
  }
  const [payloadB64, sigB64] = parts;
  let payloadJson;
  try {
    const decoded = base64urlDecode(payloadB64);
    payloadJson = new TextDecoder().decode(decoded);
  } catch {
    throw new TokenValidationError("Invalid token: payload is not valid base64url");
  }
  let providedSig;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    throw new TokenValidationError("Invalid token: signature is not valid base64url");
  }
  const expectedSig = await hmacSha256(secret, payloadJson);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    throw new TokenValidationError("Invalid token: signature verification failed");
  }
  let raw;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new TokenValidationError("Invalid token: payload is not valid JSON");
  }
  if (raw.v !== 1) {
    throw new TokenValidationError(`Invalid token: unsupported version ${raw.v}`);
  }
  if (typeof raw.pos !== "string") {
    throw new TokenValidationError("Invalid token: pos must be a string");
  }
  if (typeof raw.ts !== "number") {
    throw new TokenValidationError("Invalid token: ts must be a number");
  }
  if (!Array.isArray(raw.q)) {
    throw new TokenValidationError("Invalid token: q must be an array");
  }
  let pos;
  try {
    pos = BigInt(raw.pos);
  } catch {
    throw new TokenValidationError("Invalid token: pos is not a valid bigint");
  }
  return {
    v: 1,
    pos,
    ts: raw.ts,
    q: raw.q
  };
}

// src/event-store.browser.ts
function generateUUID() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (e) {
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = arr[6] & 15 | 64;
    arr[8] = arr[8] & 63 | 128;
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}
async function hashConfig(config) {
  const normalized = JSON.stringify(sortObjectKeys(config));
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var EventStore = class {
  constructor(options) {
    __publicField(this, "storage");
    __publicField(this, "secret");
    __publicField(this, "keyExtractor");
    __publicField(this, "config");
    __publicField(this, "initPromise", null);
    validateConfig(options.consistency);
    this.storage = options.storage;
    this.secret = options.secret;
    this.config = options.consistency;
    this.keyExtractor = new KeyExtractor(this.config);
    this.initPromise = this.checkAndReindexIfNeeded();
  }
  /**
   * Ensure the store is initialized (for async operations)
   */
  async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
    }
  }
  /**
   * Check if config has changed since last run, reindex if needed
   */
  async checkAndReindexIfNeeded() {
    if (!(this.storage instanceof SqlJsStorage)) {
      return;
    }
    try {
      await this.storage.getAllEvents();
      const currentHash = await hashConfig(this.config);
      if (!currentHash) {
        console.warn("[EventStore] Failed to compute config hash");
        return;
      }
      const storedHash = await this.storage.getConfigHash();
      if (storedHash === null) {
        console.log("[EventStore] First run, storing config hash:", currentHash.substring(0, 16) + "...");
        await this.storage.setConfigHash(currentHash);
      } else if (storedHash !== currentHash) {
        console.log("[EventStore] \u26A0\uFE0F  Config changed! Rebuilding key index...");
        console.log(`[EventStore]    Old hash: ${storedHash.substring(0, 16)}...`);
        console.log(`[EventStore]    New hash: ${currentHash.substring(0, 16)}...`);
        const startTime = Date.now();
        let eventCount = 0;
        let keyCount = 0;
        await this.storage.reindex((event) => {
          eventCount++;
          const keys = this.keyExtractor.extract({
            type: event.type,
            data: event.data,
            metadata: event.metadata
          });
          keyCount += keys.length;
          return keys;
        });
        await this.storage.setConfigHash(currentHash);
        const duration = Date.now() - startTime;
        console.log(`[EventStore] \u2705 Reindex complete: ${eventCount} events, ${keyCount} keys (${duration}ms)`);
      }
    } catch (error) {
      console.warn("[EventStore] Config hash check failed (non-fatal):", error);
    }
  }
  /**
   * Read events matching a query
   * @returns Events and a consistency token for subsequent appends
   */
  async read(query) {
    await this.ensureInitialized();
    const events = await this.storage.query(
      query.conditions,
      query.fromPosition,
      query.limit
    );
    const position = events.length > 0 ? events[events.length - 1].position : await this.storage.getLatestPosition();
    const token = await createToken(query, position, this.secret);
    return { events, token };
  }
  /**
   * Append events with consistency check
   * @param events Events to append
   * @param token Consistency token from previous read (null to skip check)
   * @returns AppendResult on success, ConflictResult on conflict
   */
  async append(events, token) {
    await this.ensureInitialized();
    if (events.length === 0) {
      const position2 = await this.storage.getLatestPosition();
      return {
        conflict: false,
        position: position2,
        token: token ?? await createToken({ conditions: [] }, position2, this.secret)
      };
    }
    const keysPerEvent = events.map((event) => this.keyExtractor.extract(event));
    if (token !== null) {
      let tokenPayload;
      try {
        tokenPayload = await validateToken(token, this.secret);
      } catch (e) {
        if (e instanceof TokenValidationError) {
          throw e;
        }
        throw e;
      }
      const conflictingEvents = await this.storage.getEventsSince(
        tokenPayload.q,
        tokenPayload.pos
      );
      if (conflictingEvents.length > 0) {
        const latestPosition = conflictingEvents[conflictingEvents.length - 1].position;
        const newToken2 = await createToken(
          { conditions: tokenPayload.q },
          latestPosition,
          this.secret
        );
        return {
          conflict: true,
          conflictingEvents,
          newToken: newToken2
        };
      }
    }
    const now = /* @__PURE__ */ new Date();
    console.log("\u{1F535} [EventStore.append] Starting to prepare events, count:", events.length);
    const eventsToStore = events.map((event, idx) => {
      console.log(`\u{1F535} [EventStore.append] Processing event ${idx}:`, JSON.stringify(event));
      const id = generateUUID();
      console.log(`\u{1F7E2} [EventStore.append] Generated UUID for event ${idx}:`, id, "type:", typeof id);
      if (!id) {
        console.error("\u{1F534} [EventStore.append] UUID generation returned falsy:", id);
        throw new Error("Failed to generate event ID");
      }
      const eventToStore = {
        id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: now
      };
      console.log(`\u{1F7E2} [EventStore.append] eventToStore ${idx}:`, JSON.stringify(eventToStore));
      return eventToStore;
    });
    console.log("\u{1F535} [EventStore.append] All eventsToStore:", JSON.stringify(eventsToStore));
    const position = await this.storage.append(eventsToStore, keysPerEvent);
    const newTokenQuery = await this.buildQueryFromEvents(events, token);
    const newToken = await createToken(newTokenQuery, position, this.secret);
    return {
      conflict: false,
      position,
      token: newToken
    };
  }
  /**
   * Build a query that covers the appended events
   * Used to create the token returned after append
   */
  async buildQueryFromEvents(events, originalToken) {
    const conditions = /* @__PURE__ */ new Map();
    if (originalToken !== null) {
      try {
        const payload = await validateToken(originalToken, this.secret);
        for (const cond of payload.q) {
          const key = `${cond.type}:${cond.key}:${cond.value}`;
          conditions.set(key, cond);
        }
      } catch {
      }
    }
    for (const event of events) {
      const extractedKeys = this.keyExtractor.extract(event);
      for (const extracted of extractedKeys) {
        const cond = { type: event.type, key: extracted.name, value: extracted.value };
        const key = `${cond.type}:${cond.key}:${cond.value}`;
        conditions.set(key, cond);
      }
    }
    return { conditions: Array.from(conditions.values()) };
  }
  /**
   * Get the underlying storage (for advanced use cases)
   */
  getStorage() {
    return this.storage;
  }
  /**
   * Close the event store
   */
  async close() {
    await this.storage.close();
  }
};
function createEventStore(options) {
  return new EventStore(options);
}

// src/storage/memory.ts
var InMemoryStorage = class {
  constructor() {
    __publicField(this, "events", []);
    __publicField(this, "nextPosition", 1n);
  }
  async append(eventsToStore, keys) {
    if (eventsToStore.length !== keys.length) {
      throw new Error("Events and keys arrays must have the same length");
    }
    let lastPosition = 0n;
    for (let i = 0; i < eventsToStore.length; i++) {
      const event = eventsToStore[i];
      const eventKeys = keys[i];
      const position = this.nextPosition++;
      this.events.push({
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        timestamp: event.timestamp,
        position,
        keys: eventKeys
      });
      lastPosition = position;
    }
    return lastPosition;
  }
  async query(conditions, fromPosition, limit) {
    const startPos = fromPosition ?? 0n;
    const matching = this.events.filter((event) => {
      if (event.position <= startPos) {
        return false;
      }
      return conditions.some((cond) => {
        if (event.type !== cond.type) {
          return false;
        }
        return event.keys.some(
          (key) => key.name === cond.key && key.value === cond.value
        );
      });
    });
    matching.sort((a, b) => a.position < b.position ? -1 : 1);
    const limited = limit !== void 0 ? matching.slice(0, limit) : matching;
    return limited.map(({ keys: _keys, ...event }) => event);
  }
  async getEventsSince(conditions, sincePosition) {
    return this.query(conditions, sincePosition);
  }
  async getLatestPosition() {
    if (this.events.length === 0) {
      return 0n;
    }
    return this.events[this.events.length - 1].position;
  }
  async close() {
  }
  /**
   * Get all events (for testing)
   */
  getAllEvents() {
    return this.events.map(({ keys: _keys, ...event }) => event);
  }
  /**
   * Clear all events (for testing)
   */
  clear() {
    this.events = [];
    this.nextPosition = 1n;
  }
};
export {
  ConfigValidationError,
  EventStore,
  InMemoryStorage,
  KeyExtractionError,
  KeyExtractor,
  SqlJsStorage,
  TokenValidationError,
  createEventStore,
  createToken,
  isConflict,
  validateConfig,
  validateToken
};
//# sourceMappingURL=boundless.browser.js.map
