// 
// A parse function for parsing the AST dump from the swift compiler.
//

interface GlobalAttrs {
  typeAliases: { [ix: string]: string };
  decoders: string[];
  encoders: string[];
}

interface TypeFuncNames {
  typeName: string;
  funcNames: string[];
}

interface TypeAliases {
  [ix: string]: string;
}

interface Struct {
  baseName: string;
  typeArguments: string[];
  varDecls: VarDecl[];
}

interface Extension {
  typeBaseName: string;
}

interface VarDecl {
  name: string;
  type: Type;
}

interface Type {
  alias?: string;
  baseName: string;
  genericArguments: Type[];
}

function globalAttrs(ast: any[]) : GlobalAttrs {
  var tfns = typeFuncNames(ast);
  var decoders = tfns
    .filter(d => d.funcNames.contains('decodeJson'))
    .map(d => d.typeName);
  var encoders = tfns
    .filter(d => d.funcNames.contains('encodeJson'))
    .map(d => d.typeName);

  return {
    typeAliases: typeAliases(ast),
    decoders: decoders,
    encoders: encoders,
  }
}

exports.globalAttrs = globalAttrs;

function typeFuncNames(ast: any[]) : TypeFuncNames[] {
  var emptyAliases: TypeAliases = {};
  var ds1 = ast
    .children('struct_decl')
    .map(s => {
      return {
        typeName: struct(s, emptyAliases)[0].baseName,
        funcNames: funcNames(s)
      }
    });
  var ds2 = ast
    .children('extension_decl')
    .map(s => {
      return {
        typeName: extension(s).typeBaseName,
        funcNames: funcNames(s)
      }
    });

  return ds1.concat(ds2);
}

function funcNames(ast: any[]) : string[] {
  return ast.children('func_decl').map(f => f.key(0))
}

function extension(ast: any[]) : Extension {
  var fullName = ast.key(0);
  var keys = ast.keys().slice(1);

  while (fullName.contains('<') && !fullName.contains('>') && keys.length > 0) {
    fullName += keys.splice(0, 1)[0]
  }

  var baseName = fullName.replace(/<([^>]*)>/g, '');

  return { typeBaseName: baseName };
}

function typeAliases(ast: any[]) : TypeAliases {
  var aliases: TypeAliases = {};

  ast.children('typealias')
    .forEach(function (t) {
      var name = t.fields().name().unquote();
      var type = t.attrs().filter(attr => attr[0] == 'type' )[1][1]

      aliases[name] = type;
    });

  return aliases;
}

function structs(ast: any[], aliases: TypeAliases) : Struct[] {
  return ast.children('struct_decl').flatMap(a => struct(a, aliases));
}

exports.structs = structs;

function struct(ast: any[], aliases: TypeAliases, prefix?: string) : Struct[] {

  prefix = prefix ? prefix + '.' : '';

  var fullName = ast.key(0);
  var baseName = prefix + fullName.replace(/<([^>]*)>/g, '');
  var typeArgs = genericArguments(fullName)
  var varDecls = ast.children('var_decl')
    .filter(a => a.attr('storage_kind') == 'stored')
    .map(a => varDecl(a, aliases));

  var r = { baseName: baseName, typeArguments: typeArgs, varDecls: varDecls };
  var rs = ast.children('struct_decl').flatMap(a => struct(a, aliases, baseName));

  return [r].concat(rs);
}

function genericArguments(fullStructName: String) : string[] {

  var matches = fullStructName.match(/<([^>]*)>/);
  if (matches && matches.length == 2)
    return matches[1].split(',').map(s => s.trim());

  return []
}

function varDecl(ast: any, aliases: TypeAliases) : VarDecl {
  return { name: ast.key(0), type: type(ast.attr('type'), aliases) };
}

function type(typeString: string, aliases: TypeAliases) : Type {

  if (aliases[typeString]) {
    var resolved = type(aliases[typeString], aliases);
    resolved.alias = typeString
    return resolved;
  }

  var isBracketed = typeString.startsWith('[') && typeString.endsWith(']');

  var isGeneric = typeString.match(/\<(.*)>/);
  var isDictionary = isBracketed && typeString.contains(':');
  var isArray = isBracketed && !typeString.contains(':');
  var isOptional = typeString.endsWith('?');

  if (isOptional) {
    var inner = typeString.substring(0, typeString.length - 1).trim();
    return { baseName: 'Optional', genericArguments: [ type(inner, aliases) ] };
  }

  if (isArray) {
    var inner = typeString.substring(1, typeString.length - 1).trim();
    return { baseName: 'Array', genericArguments: [ type(inner, aliases) ] };
  }

  if (isDictionary) {
    var matches = typeString.match(/\[(.*):(.*)\]/);

    if (matches.length != 3)
      throw new Error('"' + typeString + '" appears to be a Dictionary, but isn\'t');

    var keyType = type(matches[1].trim(), aliases);
    var valueType = type(matches[2].trim(), aliases);
    return { baseName: 'Dictionary', genericArguments: [ keyType, valueType ] };
  }

  if (isDictionary) {
    var matches = typeString.match(/\[(.*):(.*)\]/);

    if (matches.length != 3)
      throw new Error('"' + typeString + '" appears to be a Dictionary, but isn\'t');

    var keyType = type(matches[1].trim(), aliases);
    var valueType = type(matches[2].trim(), aliases);
    return { baseName: 'Dictionary', genericArguments: [ keyType, valueType ] };
  }

  if (isGeneric) {
    var baseName = typeString.replace(/<([^>]*)>/g, '');
    var matches = typeString.match(/\<(.*)>/);

    if (matches.length != 2)
      throw new Error('"' + typeString + '" appears to be a generic type, but isn\'t');

    var types = matches[1]
      .split(',')
      .map(t => t.trim())
      .map(mkType);

    return { baseName: baseName, genericArguments: types };
  }

  return { baseName: typeString, genericArguments: [] };
}

function mkType(name: string) : Type {
  return { baseName: name, genericArguments: [] };
}

// Based on: https://github.com/arian/LISP.js
function parse(text, multiple) {

  var results = []

  text = text.trim();
  text = text.replace(/='([^']*)'/g, function (n) { return n.replace(/ /g, 'JSON_GEN_SPACE') } )
  text = text.replace(/"<([^>]*)>/g, function (n) { return n.replace(/ /g, 'JSON_GEN_SPACE') } )

  if (text.charAt(0) != '(') return text;

  var stack = [];
  var token;
  var tokens = '';
  var inString = false;
  var i = 0;
  var current;

  while (i < text.length) {
    token = text.charAt(i++);

    var isOpen = token == '(';
    var isClose = token == ')';
    var isSpace = token == ' ' && !inString;

    if (isOpen || isClose || isSpace) {
      if (current && tokens.length) {
        var n = +tokens;
        var tokens_ = tokens.replace(/JSON_GEN_SPACE/g, ' ')
        current.push(isNaN(n) ? tokens_ : n);
      }
      tokens = '';
    } else {
      if (token == '"') inString = !inString;
      if (!/\s/.test(token) || inString) tokens += token;
    }

    if (isOpen) {

      var previous = current;
      current = [];

      if (previous){
        stack.push(previous);
        previous.push(current);
      }

    } else if (isClose) {

      var pop = stack.pop();
      if (!pop) {
        if (multiple) {
          results.push(current);
          current = undefined;
        }
        else {
          return current;
        }
      }

      current = pop;
    }
  }

  if (multiple) return results;

  throw 'unbalanced parentheses';
};

exports.parse = parse;

