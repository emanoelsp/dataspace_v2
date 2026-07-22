import { describe, it, expect } from "vitest"
import {
  sineOscillation,
  noisyValue,
  round,
  clamp,
  nowIso,
  extRef,
  modelRef,
  prop,
  collection,
  mlProp,
  buildNameplateSubmodel,
} from "./equipment-aas"

// ─── Math helpers ──────────────────────────────────────────────────────────────

describe("round", () => {
  it("rounds to specified decimals", () => {
    expect(round(3.14159, 2)).toBe(3.14)
    expect(round(2.005, 2)).toBe(2.01)
    expect(round(100.0, 0)).toBe(100)
  })

  it("defaults to 2 decimal places", () => {
    expect(round(1.2345)).toBe(1.23)
  })
})

describe("clamp", () => {
  it("clamps below minimum", () => expect(clamp(-5, 0, 100)).toBe(0))
  it("clamps above maximum", () => expect(clamp(150, 0, 100)).toBe(100))
  it("passes through in-range values", () => expect(clamp(50, 0, 100)).toBe(50))
  it("accepts boundary values", () => {
    expect(clamp(0, 0, 100)).toBe(0)
    expect(clamp(100, 0, 100)).toBe(100)
  })
})

describe("sineOscillation", () => {
  it("returns values within base ± amplitude", () => {
    for (let i = 0; i < 50; i++) {
      const v = sineOscillation(100, 20, 1000)
      expect(v).toBeGreaterThanOrEqual(80 - 0.001)
      expect(v).toBeLessThanOrEqual(120 + 0.001)
    }
  })

  it("returns a number", () => {
    expect(typeof sineOscillation(50, 10, 5000)).toBe("number")
  })
})

describe("noisyValue", () => {
  it("returns values within center ± noiseRange", () => {
    for (let i = 0; i < 100; i++) {
      const v = noisyValue(500, 50)
      expect(v).toBeGreaterThanOrEqual(450 - 0.001)
      expect(v).toBeLessThanOrEqual(550 + 0.001)
    }
  })
})

describe("nowIso", () => {
  it("returns a valid ISO 8601 date string", () => {
    const iso = nowIso()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(() => new Date(iso)).not.toThrow()
  })
})

// ─── Reference builders ────────────────────────────────────────────────────────

describe("extRef", () => {
  it("creates an external reference with correct structure", () => {
    const ref = extRef("0173-1#02-AAO677#002")
    expect(ref.type).toBe("ExternalReference")
    expect(ref.keys).toHaveLength(1)
    expect(ref.keys[0].type).toBe("GlobalReference")
    expect(ref.keys[0].value).toBe("0173-1#02-AAO677#002")
  })
})

describe("modelRef", () => {
  it("creates a model reference with the given type and value", () => {
    const ref = modelRef("Submodel", "urn:test:submodel:001")
    expect(ref.type).toBe("ModelReference")
    expect(ref.keys[0].type).toBe("Submodel")
    expect(ref.keys[0].value).toBe("urn:test:submodel:001")
  })
})

// ─── SubmodelElement builders ──────────────────────────────────────────────────

describe("prop", () => {
  it("creates a Property element with required fields", () => {
    const p = prop("SpindleSpeed_rpm", "xs:int", 7800)
    expect(p.modelType).toBe("Property")
    expect(p.idShort).toBe("SpindleSpeed_rpm")
    expect(p.valueType).toBe("xs:int")
    expect(p.value).toBe(7800)
    expect(p.semanticId).toBeUndefined()
  })

  it("attaches semanticId when IRDI is provided", () => {
    const p = prop("Speed", "xs:int", 100, "0173-1#02-AAV232#001")
    expect(p.semanticId).toBeDefined()
    expect(p.semanticId?.keys[0].value).toBe("0173-1#02-AAV232#001")
  })

  it("attaches description in pt and en when provided", () => {
    const p = prop("Temp", "xs:float", 65.0, undefined, "Temperatura")
    expect(p.description).toBeDefined()
    expect(p.description?.some((d) => d.language === "pt")).toBe(true)
    expect(p.description?.some((d) => d.language === "en")).toBe(true)
  })
})

describe("collection", () => {
  it("creates a SubmodelElementCollection", () => {
    const c = collection("SpindleData", [prop("RPM", "xs:int", 8000)])
    expect(c.modelType).toBe("SubmodelElementCollection")
    expect(c.idShort).toBe("SpindleData")
    expect(c.submodelElements).toHaveLength(1)
  })

  it("attaches semanticId when IRDI is provided", () => {
    const c = collection("Data", [], "urn:test:irdi")
    expect(c.semanticId?.keys[0].value).toBe("urn:test:irdi")
  })
})

describe("mlProp", () => {
  it("creates a MultiLanguageProperty", () => {
    const ml = mlProp("ManufacturerName", [{ language: "pt", text: "Fabricante Teste" }])
    expect(ml.modelType).toBe("MultiLanguageProperty")
    expect(ml.idShort).toBe("ManufacturerName")
  })
})

// ─── Nameplate submodel ────────────────────────────────────────────────────────

describe("buildNameplateSubmodel", () => {
  const testData = {
    manufacturerName: "TestCorp",
    manufacturerProductDesignation: "TestMachine X100",
    serialNumber: "SN-001",
    yearOfConstruction: "2024",
    orderCode: "X100-BASE",
    assetId: "urn:test:asset:001",
    countryOfOrigin: "BR",
  }

  it("creates a Submodel with correct id and idShort", () => {
    const sm = buildNameplateSubmodel("urn:test:asset:001", testData)
    expect(sm.id).toBe("urn:test:asset:001:Nameplate")
    expect(sm.idShort).toBe("Nameplate")
    expect(sm.modelType).toBe("Submodel")
    expect(sm.kind).toBe("Instance")
  })

  it("references the ZVEI Nameplate semanticId", () => {
    const sm = buildNameplateSubmodel("urn:test:asset:001", testData)
    expect(sm.semanticId?.keys[0].value).toContain("admin-shell.io/zvei/nameplate")
  })

  it("contains required nameplate elements", () => {
    const sm = buildNameplateSubmodel("urn:test:asset:001", testData)
    const idShorts = sm.submodelElements.map((e) => e.idShort)
    expect(idShorts).toContain("ManufacturerName")
    expect(idShorts).toContain("SerialNumber")
    expect(idShorts).toContain("YearOfConstruction")
    expect(idShorts).toContain("OrderCodeOfManufacturer")
  })

  it("uses BR as default country of origin", () => {
    const sm = buildNameplateSubmodel("urn:test:asset:001", {
      ...testData,
      countryOfOrigin: undefined,
    })
    const country = sm.submodelElements.find((e) => e.idShort === "CountryOfOrigin")
    expect(country?.value).toBe("BR")
  })
})
