//
// Several functions for generating Swift code based on the parsed AST.
//

var ast = require('./SwiftAst')

function makeFile(file: any[], globalAttrs: GlobalAttrs, filename: string): string[] {

  function decoderExists(typeName: string) : boolean {
    return globalAttrs.decoders.contains(typeName);
  }

  function encoderExists(typeName: string) : boolean {
    return globalAttrs.encoders.contains(typeName);
  }

  var structs = ast.structs(file, globalAttrs.typeAliases)
    .filter(s => !decoderExists(s.baseName) || !encoderExists(s.baseName));

  var enums = ast.enums(file, globalAttrs.typeAliases)
    .filter(e => !decoderExists(e.baseName) || !encoderExists(e.baseName));

  var lines = [];

  lines.push('//');
  lines.push('//  ' + filename);
  lines.push('//');
  lines.push('//  Auto generated by swift-json-gen on ' + new Date().toUTCString());
  lines.push('//  See for details: https://github.com/tomlokhorst/swift-json-gen')
  lines.push('//');
  lines.push('');
  lines.push('import Foundation');
  lines.push('');

  enums.forEach(function (s) {

    var createDecoder = !decoderExists(s.baseName);
    var createEncoder = !encoderExists(s.baseName);

    lines.push('extension ' + s.baseName + ' {')

    if (createDecoder) {
      lines = lines.concat(makeEnumDecoder(s));
    }

    if (createDecoder && createEncoder) {
      lines.push('');
    }

    if (createEncoder) {
      lines = lines.concat(makeEnumEncoder(s));
    }

    lines.push('}');
    lines.push('');
  });

  structs.forEach(function (s) {

    var createDecoder = !decoderExists(s.baseName);
    var createEncoder = !encoderExists(s.baseName);

    lines.push('extension ' + s.baseName + ' {')

    if (createDecoder) {
      lines = lines.concat(makeStructDecoder(s));
    }

    if (createDecoder && createEncoder) {
      lines.push('');
    }

    if (createEncoder) {
      lines = lines.concat(makeStructEncoder(s, enums));
    }

    lines.push('}');
    lines.push('');
  });

  return lines;
}

exports.makeFile = makeFile;

function makeEnumDecoder(en: Enum) : string {
  var lines = [];

  lines.push('  static func decodeJson(json: AnyObject) throws -> ' + en.baseName + ' {');
  lines.push('    guard let rawValue = json as? ' + en.rawTypeName + ' else {');
  lines.push('      throw JsonDecodeError.WrongType(rawValue: json, expectedType: "' + en.rawTypeName + '")');
  lines.push('    }');
  lines.push('    guard let value = ' + en.baseName + '(rawValue: rawValue) else {');
  lines.push('      throw JsonDecodeError.WrongEnumRawValue(rawValue: rawValue, enumType: "' + en.baseName + '")');
  lines.push('    }');
  lines.push('');
  lines.push('    return value');
  lines.push('  }');

  return lines.join('\n');
}

function makeEnumEncoder(en: Enum) : string {
  var lines = [];

  lines.push('  func encodeJson() -> ' + en.rawTypeName + ' {');
  lines.push('    return rawValue');
  lines.push('  }');

  return lines.join('\n');
}

function makeStructDecoder(struct: Struct) : string {
  var lines = [];

  var curried = struct.typeArguments.length > 0;

  if (curried) {
    lines.push('  static func decodeJson' + decodeArguments(struct) + ' -> AnyObject throws -> ' + struct.baseName + ' {');
    lines.push('    return { json in');
  }
  else {
    lines.push('  static func decodeJson(json: AnyObject) throws -> ' + struct.baseName + ' {');
  }

  var body = makeStructDecoderBody(struct).map(indent(curried ? 6 : 4));
  lines = lines.concat(body);

  if (curried) {
    lines.push('    }');
  }

  lines.push('  }');

  return lines.join('\n');
}

function decodeArguments(struct: Struct) : string {
  var parts = struct.typeArguments
    .map(t => 'decode' + t + ': AnyObject throws -> ' + t)

  for (var i = 1; i < parts.length; i++) {
    parts[i] = '_ ' + parts[i];
  }

  return '(' + parts.join(', ') + ')';
}

function makeStructDecoderBody(struct: Struct) : string[] {
  if (struct.varDecls.length == 0) {
    return ['return ' + struct.baseName + '()'];
  }

  var lines = [];

  lines.push('let decoder = try JsonDecoder(json: json)');
  lines.push('');

  struct.varDecls.forEach(function (field, ix) {
    var decoder = decodeFunction(field.type, struct.typeArguments)
    var line = 'let _' + field.name + ' = '
      + 'try decoder.decode("' + field.name + '", decoder: ' + decoder + ')';

    lines.push(line)
  });

  lines.push('');

  var fieldDecodes = struct.varDecls.map(function (field, ix) {
    var isLast = struct.varDecls.length == ix + 1
    var commaOrBrace = isLast ? '' : ','

    var line = field.name + ' = _' + field.name + commaOrBrace;

    return line
  });

  if (fieldDecodes.length == 1) {
    lines.push('guard let ' + fieldDecodes[0] + ' else {');
  }
  else {
    lines.push('guard let');
    lines = lines.concat(fieldDecodes.map(indent(2)));
    lines.push('else {');
  }

  var params = struct.varDecls.map(decl => decl.name + ': ' + decl.name)
  lines.push('  throw JsonDecodeError.StructErrors(type: "' + struct.baseName + '", errors: decoder.errors)')
  lines.push('}');

  lines.push('')
  lines.push('return ' + struct.baseName + '(' + params.join(', ') + ')')

  return lines
}

function decodeFunction(type: Type, genericDecoders: string[]) : string {

  if (isKnownType(type))
    return '{ $0 }';

  var args = type.genericArguments
    .map(a => decodeFunction(a, genericDecoders))
    .join(', ');

  var argList = args.length ? '(' + args + ')' : '';
  var typeName = type.alias || type.baseName;

  if (genericDecoders.contains(typeName))
    return 'decode' + typeName + argList;

  return typeName + '.decodeJson' + argList;
}

function makeStructEncoder(struct: Struct, enums: Enum[]) : string {
  var lines = [];

  lines.push('  func encodeJson' + encodeArguments(struct) + ' -> [String: AnyObject] {');

  var body = makeStructEncoderBody(struct, enums).map(indent(4));
  lines = lines.concat(body);
  lines.push('  }');

  return lines.join('\n');
}

function encodeArguments(struct: Struct) : string {
  var parts = struct.typeArguments
    .map(t => 'encode' + t + ': ' + t + ' -> AnyObject')

  for (var i = 1; i < parts.length; i++) {
    parts[i] = '_ ' + parts[i];
  }

  return '(' + parts.join(', ') + ')';
}

function makeStructEncoderBody(struct: Struct, enums: Enum[]) : string[] {
  if (struct.varDecls.length == 0) {
    return ['return [:]'];
  }

  var lines = [];
  lines.push('var dict: [String: AnyObject] = [:]');
  lines.push('');

  struct.varDecls.forEach(function (d) {
    var subs = makeFieldEncode(d, struct.typeArguments, enums);
    lines = lines.concat(subs);
  });

  lines.push('');
  lines.push('return dict');

  return lines;
}

function encodeFunction(name: string, type: Type, genericEncoders: string[]) : string {

  if (isKnownType(type))
    return name;

  if (genericEncoders.contains(type.baseName))
    return 'encode' + type.baseName + '(' + name + ')';

  var args = type.genericArguments
    .map(t => '{ ' + encodeFunction('$0', t, genericEncoders) + ' }')
    .join(', ');

  return name + '.encodeJson(' + args + ')';
}

function makeFieldEncode(field: VarDecl, structTypeArguments: string[], enums: Enum[]) {
  var lines = [];

  var name = field.name;
  var type = field.type;

  var prefix = ''

  if (type.baseName == 'Dictionary' && type.genericArguments.length == 2) {
    var keyType = type.genericArguments[0].baseName;
    var enum_ = enums.filter(e => e.baseName == keyType)[0];
    if (keyType != 'String' && enum_.rawTypeName != 'String') {
      lines.push('/* WARNING: Json only supports Strings as keys in dictionaries */');
    }
  }
  lines.push('dict["' + name + '"] = ' + encodeFunction(name, type, structTypeArguments));

  return lines;
}

function indent(nr) {
  return function (s) {
    return s == '' ? s :  Array(nr + 1).join(' ') + s;
  };
}

function isKnownType(type: Type) : boolean {
  var types = [ 'AnyObject', 'AnyJson' ];
  return types.contains(type.alias) || types.contains(type.baseName);
}
