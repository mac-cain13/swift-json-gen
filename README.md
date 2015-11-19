<img src="https://cloud.githubusercontent.com/assets/75655/5062099/8cc5f3f8-6db3-11e4-8620-c3da216c1262.png" width="218" alt="Swift JsonGen">
<hr>

JsonGen generates source code files with decoders and encoders for parsing JSON
into immutable Swift structs.

Features
--------

 * Generates an extension with a `decodeJson` and `encodeJson` method for each struct
 * Works on individual `.swift` files or whole directories
 * Handles type aliases
 * Supports primitive types, nested types and custom generic types
 * Allow for part of the datastructure to remain untyped

See also the blog post:
[Swift + JSON with code generation](http://tomlokhorst.tumblr.com/post/119966903324/json-swift-with-code-generation)


Installation
------------

Install the latest release from NPM:

    > npm install -g swift-json-gen

Also copy [`example/JsonGen.swift`](https://raw.githubusercontent.com/tomlokhorst/swift-json-gen/develop/example/JsonGen.swift)
into your own project.
This file contains some encoders and decoders for default Swift and Foundation
types.


Example
-------

Assuming you have a file `example/Blog.swift` containing one or more structs:

```swift
struct Blog {
  let id: Int
  let name: String
  let author: String?
  let needsPassword : Bool
  let url: NSURL
}
```

To generate Json decoders based a file of structs run:

    > swift-json-gen example/Blog.swift


This will generate the file
[`example/Blog+JsonGen.swift`](https://raw.githubusercontent.com/tomlokhorst/swift-json-gen/develop/example/Blog+JsonGen.swift)
with the following (truncated) content:

```swift
extension Blog {
  static func decodeJson(json: AnyObject) throws -> Blog {
    guard let dict = json as? [String : AnyObject] else {
      throw JsonDecodeError.WrongType(rawValue: json, expectedType: "Object")
    }

    var errors: [String: JsonDecodeError] = [:]

    var id_optional: Int?

    if let id_field: AnyObject = dict["id"] {
      do {
        id_optional = try Int.decodeJson(id_field)
      }
      catch let error as JsonDecodeError {
        errors["id"] = error
      }
    }
    else {
      errors["id"] = JsonDecodeError.MissingField
    }

    .... TRUNCATED ...

    guard
      let id = id_optional,
      let name = name_optional,
      let author = author_optional,
      let needsPassword = needsPassword_optional,
      let url = url_optional
    else {
      throw JsonDecodeError.StructErrors(type: "Blog", errors: errors)
    }

    return Blog(id: id, name: name, author: author, needsPassword: needsPassword, url: url)
  }

  func encodeJson() -> [String: AnyObject] {
    var dict: [String: AnyObject] = [:]

    dict["id"] = id.encodeJson()
    dict["name"] = name.encodeJson()
    dict["author"] = author.encodeJson({ $0.encodeJson() })
    dict["needsPassword"] = needsPassword.encodeJson()
    dict["url"] = url.encodeJson()

    return dict
  }
}
```


Usage
-----

Include the generated `YourFile+JsonGen.swift` file and the
[`example/JsonGen.swift`](https://raw.githubusercontent.com/tomlokhorst/swift-json-gen/develop/example/JsonGen.swift) file into your project.
The generated encoder and decoder can be used in conjunction with NSJSONSerialization like so:

```swift
let inputStr = "{ \"title\": \"Hello, World!\", \"published\": true, \"author\": { \"first\": \"Tom\", \"last\": \"Lokhorst\" } }"
let inputData = inputStr.dataUsingEncoding(NSUTF8StringEncoding)!
let inputObj = try! NSJSONSerialization.JSONObjectWithData(inputData, options: [])

let blog = try! Blog.decodeJson(inputObj)

let outputObj = blog.encodeJson()
let outputData = try! NSJSONSerialization.dataWithJSONObject(outputObj, options: NSJSONWritingOptions.PrettyPrinted)
let outputStr = String(data: outputData, encoding: NSUTF8StringEncoding)!
```


Customization
-------------

If you want to differ from the default generated code you can provide your own
`decodeJson` or `encodeJson` functions. If these already exist, no new
function will be generated.

You also need to provide your own functions for kinds that are not supported,
like enums and classes.


How it works
------------

This program calls the Swift compiler and dumps the parsed AST.
(Using the command `xcrun swiftc -dump-ast SomeFile.swift`)

This AST is traversed to look for struct definitions, for each struct
`decodeJson` and `encodeJson` functions is generated:

```swift
extention SomeStruct {
  static func decodeJson(json: AnyObject) throws -> SomeStruct {
    ...
  }

  func encodeJson() -> AnyObject {
    ...
  }
}
```


Compiling
---------

This package is written in TypeScript. To make changes to the code of JsonGen, first install TypeScript:

    > npm install -g typescript

Edit the `.ts` files and compile the code as follows:

    > tsc lib/*.ts


Releases
--------

 - **0.3.0** - 2015-11-19 - Decoders with `throws`, instead of returning an optional
 - 0.2.2 - 2015-09-22 - Bugfix, show correct error on missing field
 - 0.2.1 - 2015-09-14 - Bugfix, now works with released Xcode
 - **0.2.0** - 2015-09-11 - Update to Swift 2
 - 0.1.3 - 2015-07-22 - Show all Swift compiler errors
 - 0.1.2 - 2015-06-01 - Support for computed properties
 - 0.1.1 - 2015-05-28 - Don't generate empty files
 - **0.1.0** - 2015-05-25 - Initial public release
 - 0.0.0 - 2014-10-11 - Initial private version for project at [Q42](http://q42.com)


Licence & Credits
-----------------

JsonGen is written by [Tom Lokhorst](https://twitter.com/tomlokhorst) of [Q42](http://q42.com)
and available under the [MIT license](https://github.com/tomlokhorst/swift-json-gen/blob/develop/LICENSE),
so feel free to use it in commercial and non-commercial projects.
