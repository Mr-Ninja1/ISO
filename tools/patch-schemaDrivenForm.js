const fs = require('fs');

const path = 'src/lib/schemaDrivenForm.ts';
let s = fs.readFileSync(path, 'utf8');

const newFunc = `function fieldToZod(field: FieldDef) {
  switch (field.type) {
    case "text": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "temp": {
      let inner = z.number({ required_error: "Required", invalid_type_error: "Required" });
      if (typeof field.min === "number") inner = inner.min(field.min);
      if (typeof field.max === "number") inner = inner.max(field.max);

      return field.required
        ? z.preprocess(numberFromString, inner)
        : z.preprocess(numberFromString, inner.optional());
    }
    case "signature": {
      const requiredInner = z
        .string({ required_error: "Required", invalid_type_error: "Required" })
        .min(1, "Required");
      const optionalInner = z.string().optional();

      return field.required
        ? z.preprocess(emptyStringToUndefined, requiredInner)
        : z.preprocess(emptyStringToUndefined, optionalInner);
    }
    case "dynamic-table": {
      const row = z.record(z.string(), z.any());
      const base = z.array(row);
      return field.required ? base.min(1, "Add at least one row") : base.optional();
    }
    default: {
      // Exhaustive check
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _never: never = field;
      return z.any();
    }
  }
}
`;

const re = /function fieldToZod\(field: FieldDef\)\s*\{[\s\S]*?\r?\n\}\r?\n\r?\nexport function buildZodSchema/;
if (!re.test(s)) {
  console.error('Pattern not found in', path);
  process.exit(1);
}

s = s.replace(re, newFunc + '\r\n\r\nexport function buildZodSchema');
fs.writeFileSync(path, s, 'utf8');
console.log('Patched', path);
