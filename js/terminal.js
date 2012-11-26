(function(){
  
  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
  var input_ = document.getElementById('input')
    , output_ = document.getElementById('terminal')
    , wrapper_ = document.getElementById('wrapper')
    , buffer_ = localStorage.buffer ? JSON.parse(localStorage.buffer) : []
    , history_ = localStorage.history ? JSON.parse(localStorage.history) : []
    , index_ = history_.length
    , fs_, cwd_
  
  function error(e) {
    var msg = [
      ''
      , 'NOT_FOUND_ERR'
      , 'SECURITY_ERR'
      , 'ABORT_ERR'
      , 'NOT_READABLE_ERR'
      , 'ENCODING_ERR'
      , 'NO_MODIFICATION_ALLOWED_ERR'
      , 'INVALID_STATE_ERR'
      , 'SYNTAX_ERR'
      , 'INVALID_MODIFICATION_ERR'
      , 'QUOTA_EXCEEDED_ERR'
      , 'TYPE_MISMATCH_ERR'
      , 'PATH_EXISTS_ERR'
    ][e.code]
    output(msg)
    read()
  }
  
  function read() {
    output_.insertAdjacentElement('beforeEnd', wrapper_)
    wrapper_.style.display = 'inline'
    input_.scrollIntoView()
    input_.focus()
  }
  
  function output(data, hist) {
    if (!hist) {
      output_.insertAdjacentHTML('beforeEnd', '<div>'+ data + '</div>')
      buffer_.push('<div>'+ data + '</div>')
      localStorage.buffer = JSON.stringify(buffer_)
    } else {
      output_.insertAdjacentHTML('beforeEnd', '<div class="dim">'+ data + '</div>')
    }
  }
  
  function do_(cmd, cwd, src, dest, cb) {
    cwd.getDirectory(src, {}, function(srcEntry) { // folder -> folder
      var create = ['.', './', '..', '../', '/'].indexOf(dest) === -1
      cwd.getDirectory(dest, {create: create}, function(destEntry) {
        srcEntry[cmd](destEntry)
        cb()
      }, error)
    }, function(e) { // file -> folder
      cwd.getFile(src, {}, function(srcEntry) {
        cwd.getDirectory(dest, {}, function(destEntry) {
          srcEntry[cmd](destEntry)
          cb()
        }, function(e) { // file -> file
          cwd.getFile(src, {}, function(srcEntry) {
            srcEntry[cmd](cwd, dest)
            cb()
          }, error)
        })
      }, error)
    })
  }
  
  function cp(cwd, src, dest, cb) {
    do_('copyTo', cwd, src, dest, cb)
  }
  
  function mv(cwd, src, dest, cb) {
    do_('moveTo', cwd, src, dest, cb)
  }
  
  function touch(cwd, file, cb) {
    cwd.getFile(file, {create: true}, cb, error)
  }
  
  function mkdir(cwd, entries, recursive, cb) {
    entries.forEach(function(dirName) {
      if (recursive) {
        mkd(cwd, dirName.split('/'))
        function mkd(root, folders) {
          root.getDirectory(folders[0], {create: true}, function(dirEntry) {
            if (folders.length) mkd(dirEntry, folders.slice(1))
            else cb()
          }, error)
        }
      } else {
        cwd.getDirectory(dirName, {create: true, exclusive: true}, cb, error)
      }
    })
  }
  
  function rm(cwd, entries, recursive, cb) {
    entries.forEach(function(fileName) {
      cwd.getFile(fileName, {}, function(fileEntry) { // file
        fileEntry.remove(cb, error)
      }, function(e) { // directory
        if (recursive && e.code == FileError.TYPE_MISMATCH_ERR) {
          cwd.getDirectory(fileName, {}, function(dirEntry) {
            dirEntry.removeRecursively(cb, error)
          }, error)
        } else { // some other error
          error(e)
        }
      })
    })
  }
  
  function ls(cwd, path, cb) {
    var entries = []
      , reader = cwd.createReader()
      , readEntries = function() {
          reader.readEntries(function(res) {
            if (!res.length) {
              entries = entries.sort()
              cb(entries)
            } else {
              entries = entries.concat([].slice.call(res))
          readEntries()
        }
      }, error)
    }

    readEntries()
  }
  
  function cat(cwd, path, cb) {
    cwd.getFile(path, {}, function(fileEntry) {
      fileEntry.file(function(file) {
        var reader = new FileReader()
        reader.onloadend = function(e) {
          cb(this.result)
        }
        reader.readAsText(file)
      }, error)
    }, error)
  }
  
  function cd(cwd, dest, cb) {
    cwd.getDirectory(dest, {}, function(destEntry) {
      cwd_ = destEntry
      cb(destEntry.fullPath)
    }, error)
  }
  
  function write(cwd, path, text, append, cb) {
    cwd.getFile(path, {create: true}, function(fileEntry) {
      fileEntry.createWriter(function(fileWriter) {
        fileWriter.onwriteend = cb
        fileWriter.onerror = error
        if (append)
          fileWriter.seek(fileWriter.length)
        else
          fileWriter.truncate(0)
        
        setTimeout(function(){ // INVALID_STATE_ERR
          var blob = new Blob([text], {type: 'text/plain'})
          fileWriter.write(blob)
        }, 5)
        
      }, error)
    }, error)
  }
  
  function clear(cb) {
    buffer_ = []
    localStorage.removeItem('buffer')
    output_.innerHTML = ''
    cb()
  }
  
  function exec(input) {
    if (input && (input = input.trim())) {
      var args = input.split(' ').filter(function(_) {
            return _.trim()
          })
        , cmd = args[0].toLowerCase()
      args = args.splice(1)
    } else {
      output('$> '+ input_.value)
      read()
      return
    }
    index_ = history_.push(input_.value)
    localStorage.history = JSON.stringify(history_)
    output('$> '+ input_.value)
    input_.value = ''
    wrapper_.style.display = 'none'
    switch (cmd) {
      case 'rm':
        var recursive = false
          , index = ~args.indexOf('-r') || ~args.indexOf('-rf')
        if (~index > -1) {
          args.splice(~index, 1)
          recursive = true
        }
        rm(cwd_, args, recursive, read)
        break
      case 'mv':
        mv(cwd_, args[0], args[1], read)
        break
      case 'cp':
        cp(cwd_, args[0], args[1], read)
        break
      case 'ls':
        ls(cwd_, args[0], function(entries){
          entries.forEach(function(e){
            output(e.name + (e.isDirectory ? '/' : ''))
          })
          read()
        })
        break
      case 'cat':
        cat(cwd_, args[0], function(data){output(data);read()})
        break
      case 'touch': 
        touch(cwd_, args[0], read)
        break
      case 'mkdir':
        var recursive = false
          , index = args.indexOf('-p')
        if (index > -1) {
          args.splice(index, 1)
          recursive = true
        }
        if (!args.length) {
          output('usage: ' + cmd + ' [-p] directory')
          break
        }
        mkdir(cwd_, args, recursive, read)
        break
      case 'echo':
        if (args[2])
          write(cwd_, args[2], args[0].slice(1, -1), args[1] === '>>', read)
        else
          output(args[0])
        break
      case 'cd':
        cd(cwd_, args[0], read)
        break
      case 'date':
        output((new Date()).toLocaleString())
        read()
        break
      case 'pwd':
        output(cwd_.fullPath)
        read()
        break
      case 'wget':
        var url = args[0]
        if (!url) {
          output('usage: '+ cmd +' missing URL')
          break
        } else if (url.search('^http://') == -1) {
          url = 'http://' + url
        }
        var xhr = new XMLHttpRequest()
        xhr.onload = function(e) {
          if (this.status == 200 && this.readyState == 4) {
            output(this.response)
          } else {
            error('ERROR: ' + this.status + ' ' + this.statusText)
          }
        }
        xhr.onerror = function(e) {
          output('ERROR: ' + this.status + ' ' + this.statusText)
          output('Could not fetch ' + url)
        }
        xhr.open('GET', url, true)
        xhr.send()
        break
      case 'clear':
        clear(read)
        break
      default:
        output('Unknown command')
        read()
    }
  }
  
  function init() {
    window.requestFileSystem(window.TEMPORARY, 1024*1024, function(fs) {
      fs_ = fs
      cwd_ = fs_.root
      input_.addEventListener('keydown', function(e){
        if (e.keyCode == 38) { // Up
          e.preventDefault()
          if (index_-1 >= 0)
            this.value = history_[--index_]
        } else if (e.keyCode == 40) { // Down
          e.preventDefault()
          if (index_+1 < history_.length)
            this.value = history_[++index_]
          else {
            index_ = history_.length
            this.value = ''
          }
        } else if (e.keyCode == 9) { // Tab
          e.preventDefault()
        } else if (e.keyCode == 13 ) { // Enter
          exec(this.value)
        } 
      }, false)
      document.body.addEventListener('click', function(){
        input_.focus()
      }, false);
      buffer_.forEach(function(entry){
        output(entry, true)
      })
      read()
    }, error)
  }
  
  window.Terminal = {
    exec: exec
  }

  window.requestFileSystem && init()
  
}())