/**
 *
 * argenmap.vis. Plugin de jquery que carga una vista de mapa
 * descripta en json sobre un mapa de argenmap.
 * acepta 
 */
;(function($){

  function Argenmapvis(el, options) {

    //Defaults:
    this.defaults = {
      source: '0AqdTbs1TYvZKdFlQVDNBdFVKSFZzci04UE5UYkpmYmc',
      vistaInicial: {
        lat: -34,
        lng: -59,
        zoom: undefined,
        capa: undefined
      },
        //mapa de campos
        //yo le doy bola solo a titulo capa recurso tiporecurso
        //zoom y descripcion.
        // si en tu json, tenes otros campos, pasale un objeto .argenwamp({objeto})
        // con la propiedad  field_map y el mapeo del nombre de tus campos a estos.
        // Por default el mapa es un mapeo dummy.
      field_map : {

        titulo: "titulo",
        capa: "capa",
        recurso: "recurso",
        tiporecurso: "tiporecurso",
        zoom: "zoom",
        descripcion: "descripcion",
        grupo: "grupo"
      },
      barra_class: '.barra',
      barra_titulo_class: '.titulo',
      barra_descripcion_class: '.descripcion'
    };

    //Extending options:
    this.opts = $.extend({}, this.defaults, options);

    //Privates:
    this.$el = $(el);
    this.entries = [];
    this.marcadores = [];
    this.marcadores_parsed = []
    this.wms = [];
    this.kml = [];
    this.controlDiv = null;
  }

  // Separate functionality from object creation
  Argenmapvis.prototype = {

    init: function() {
      var _this = this;
      _this.$el.spin({width:5.5});
      $.when( _this.getDoc() ).done(function() {
          _this.magic();  
          _this.$el.spin(false);
      }).fail(function() {
        console.log('source inválido');
        _this.$el.spin(false);
      });
    },


    //Busca el JSON de la Google Docs Spreadsheet
    getDoc: function() {
      var _this = this;
      var deferred = $.Deferred();

      var source = _this.opts.source;

      var valid_url = ($.url(source ,true).attr('host') !== '');
        /*
         * Si source no es una url válida con domain, 
         * asumo que es un id de google docs
         */
      if (! valid_url ) {
        _this.getGoogleDocsJSON(source, deferred);
      } else {
        _this.getJSON(source, deferred);
      }
      
      return deferred.promise();      
    },

    getJSON: function (source, deferred) {
      var _this = this;
      $.get(source, function(data){
        _this.entries = data;
        
        _this.entries = _this._mapFields();
        _this.parsePlainJSON(deferred);        
      });
    },

    getGoogleDocsJSON: function (google_docs_id, deferred) {
      var _this = this;
      if (google_docs_id) {
        _this.opts.google_dodcs_id = google_docs_id;
      }
      var url = "https://spreadsheets.google.com/feeds/list/{google_docs_id}/od6/public/values?alt=json";

      url = url.replace("{google_docs_id}", google_docs_id);
      if (!google_docs_id ) {
        return false;
      }
      $.get(url, function(data){
         _this.entries = data.feed.entry;
         //paso el dererred porque el cálculo quizás
         // es asincrónico porque el usuario puede usar
         // texto para geocodificar en el campo recurso de la entry texto
         _this.GDocsJSON2PlainJSON();
         _this.parsePlainJSON(deferred);
      }).fail(function() {
        _this.alert('La hoja de cálculo no está publicada o no existe.');
      });
    },
    
    GDocsJSON2PlainJSON: function () {
      var _this = this;

      /*
       * El JSON de un google docs, tiene la propiedad $t
       * en cada campo que tiene el valor del resultado.
       * así que lo manejo como un caso especial
       */
      _this.opts.field_map = {
          titulo: "gsx$titulo.$t",
          capa: "gsx$capa.$t",
          recurso: "gsx$recurso.$t",
          tiporecurso: "gsx$tiporecurso.$t",
          zoom: "gsx$zoom.$t",
          descripcion: "gsx$descripcion.$t",
          grupo: "gsx$grupo.$t"
      };

      _this.entries = _this._mapFields(true);
    },

    parsePlainJSON: function(deferred) {
      var _this = this;

      var recursos = _this.entries.groupBy(function(item) {
        return item.tiporecurso;
      });

      _this.wms = recursos.wms;
      _this.marcadores = recursos.marcador;
      _this.kml = recursos.kml;

      if (recursos.centro !== undefined) {
        _this.parseCoordenadas(recursos.centro[0].recurso, function(latlng) {
          _this.opts.vistaInicial.lat = latlng.lat;
          _this.opts.vistaInicial.lng = latlng.lng;

          if (recursos.centro[0].zoom !== undefined) {
            _this.opts.vistaInicial.zoom = recursos.centro[0].zoom;  
          }

          if (recursos.centro[0].capa === 'satelite' ) {
            _this.opts.vistaInicial.capa = 'satellite';  
          }

          if (recursos.centro[0].capa === 'mapaignbyn' ) {
            _this.$el.addClass('argenmapvis_byn');
          }

          if (recursos.centro[0].titulo ) {
            $(_this.opts.barra_class).show();
            $(_this.opts.barra_class + ' ' + _this.opts.barra_titulo_class).html(recursos.centro[0].titulo);
          }          

          if (recursos.centro[0].descripcion ) {
            $(_this.opts.barra_class).show();
            $(_this.opts.barra_class + ' ' + _this.opts.barra_descripcion_class).html(recursos.centro[0].descripcion);
          }          

          deferred.resolve();
          return deferred;    
        });
      } else {
        deferred.resolve();
      }
      
    },

    _mapFields: function(is_google_docs_json)
    {
      var _this = this;
      var field_map = _this.opts.field_map;
      var entries = [];

      entries = $.map(_this.entries, function(entry, i) {
        var mapped={};

        try {
          // Esto puede tirar error
          // si en la spreadsheet no están los encabezados
          mapped = magic_map(entry);
        } catch(e) {

        }
        return mapped;
      }); // fin del $.map
      
      function magic_map(entry)
      {
        var ret = {};
        $.each(field_map, function(name, real_name) {
          var tmp = entry;
          var partes = real_name.split('.');
          try {
            $(partes).each(function() {
              tmp = tmp[this];
            });
            ret[name] = tmp;
            
          } catch(e) {
            if (name != 'grupo') {
              var url = 'https://docs.google.com/spreadsheet/pub?key={google_docs_id}&output=html';
              url = url.replace('{google_docs_id}', _this.opts.source);
              var msg = "Falta la línea de encabezados en la <a target='blank' href='{url}'>hoja de cálculo</a>";
              msg = msg.replace('{url}', url);
              _this.alert(msg);            
            }
            //tirar error del try de arriba si faltan encabezados esencials, no como la columna 'grupo' 
          }

        });
        return ret;
      }

      return entries;
    },

    magic: function () {
      var _this = this;

      $mapa = _this.$el;
      $mapa.argenmap();


      var map = $mapa.data().gmap;
      

      
      if (_this.opts.vistaInicial.zoom !== undefined) {
        $mapa.zoom( parseInt(_this.opts.vistaInicial.zoom) );      
      }

      if (_this.opts.vistaInicial.capa !== undefined) {
        $mapa.capaBase( _this.opts.vistaInicial.capa );      
      }

      if (_this.opts.vistaInicial.lat !== undefined) {
        $mapa.centro( _this.opts.vistaInicial.lat, _this.opts.vistaInicial.lng );      
      }

      $(_this.wms).each(function(k,capa) {
        $mapa.agregarCapaWMS({
          nombre: capa.titulo,
          capas: capa.capa,
          url: capa.recurso
        });
      });

      if (_this.marcadores ) {
        var marcadores_por_grupo = _this.marcadores.groupBy(function(item) {
          return item.grupo;
        });
      }

      {
        var vistas = [
          {lat: -34.000000, lng: -59, zoom: 3, nombre: "[ Todas ]"},
          {lat: -34.608345, lng: -58.438683, zoom: 13, nombre: "Ciudad Autónoma de Buenos Aires"},
          {lat: -37.201728, lng: -59.84107, zoom: 7, nombre: "Buenos Aires"},
          {lat: -27.076391, lng: -66.998801, zoom: 8, nombre: "Catamarca"},
          {lat: -26.585766, lng: -60.954007, zoom: 8, nombre: "Chaco"},
          {lat: -43.684619, lng: -69.274554, zoom: 7, nombre: "Chubut"},
          {lat: -32.29684, lng: -63.580611, zoom: 8, nombre: "Córdoba"},
          {lat: -28.58416, lng: -58.007192, zoom: 8, nombre: "Corrientes"},
          {lat: -32.517564, lng: -59.104176, zoom: 8, nombre: "Entre Ríos"},
          {lat: -24.657002, lng: -60.216064, zoom: 8, nombre: "Formosa"},
          {lat: -22.663321, lng: -66.236717, zoom: 8, nombre: "Jujuy"},
          {lat: -37.03764, lng: -65.687256, zoom: 8, nombre: "La Pampa"},
          {lat: -29.900172, lng: -66.998801, zoom: 8, nombre: "La Rioja"},
          {lat: -34.586903, lng: -68.143141, zoom: 8, nombre: "Mendoza"},
          {lat: -26.652368, lng: -54.805298, zoom: 9, nombre: "Misiones"},
          {lat: -38.823384, lng: -69.669119, zoom: 8, nombre: "Neuquén"},
          {lat: -40.530502, lng: -67.664795, zoom: 7, nombre: "Río Negro"},
          {lat: -25.252954, lng: -64.716241, zoom: 8, nombre: "Salta"},
          {lat: -30.872459, lng: -68.524715, zoom: 8, nombre: "San Juan"},
          {lat: -33.876902, lng: -66.236717, zoom: 8, nombre: "San Luis"},
          {lat: -49.853465, lng: -70.092773, zoom: 7, nombre: "Santa Cruz"},
          {lat: -30.244153, lng: -60.582068, zoom: 7, nombre: "Santa Fe"},
          {lat: -27.858504, lng: -63.336182, zoom: 8, nombre: "Santiago del Estero"},
          {lat: -26.946846, lng: -65.285708, zoom: 9, nombre: "Tucumán"},
          {lat: -54.308355, lng: -67.745156, zoom: 8, nombre: "Tierra del Fuego"},          
          {lat: -65.654726, lng: -60.021728, zoom: 5, nombre: "Antártida"},
          {lat: -51.7, lng: -57.85, zoom: 8, nombre: "Islas Malvinas"},
          {lat: -57.75, lng: -26.5, zoom: 7, nombre: "Islas Sandwich del Sur"},
          {lat: -54.43333, lng:-36.55, zoom: 7, nombre: "Islas Georgias del Sur"}
        ];        
        this.controlDeVista = _this.ControlDeVista('Seleccione una provincia', vistas);
        map.controls[google.maps.ControlPosition.RIGHT_TOP].push(this.controlDeVista);
      }

      if (_this.marcadores &&  marcadores_por_grupo[undefined] === undefined) {
        this.controlDiv = _this.ControlDeGrupos('Marcadores', marcadores_por_grupo);
    
        // Add the control to the map at a designated control position
        // by pushing it on the position's array. This code will
        // implicitly add the control to the DOM, through the Map
        // object. You should not attach the control manually.
        map.controls[google.maps.ControlPosition.RIGHT_TOP].push(this.controlDiv);
      }

      $(_this.marcadores).each(function(k, marcador) {
        _this.agregarMarcador(marcador);

      });
      $(_this.kml).each(function(k, kml) {
        $mapa.agregarCapaKML({
          nombre: kml.titulo,
          url: 'http://mapa.ign.gob.ar/mapa/proxy/?url=' + encodeURIComponent(kml.recurso)
        });
      })
    },

    agregarMarcador: function(marcador) {
      var _this = this;
      _this.parseCoordenadas(marcador.recurso, function(latlng) {
        if (! latlng.lat ) {
          return;
        }
        var $contenido = $('<div />');
        $("<h3 />").html(marcador.titulo).appendTo($contenido);
        $("<div />").html(marcador.descripcion).appendTo($contenido);
        var argenmap = $mapa.data('argenmap');

        if (argenmap.markerCluster === undefined) {
          argenmap.markerCluster = new MarkerClusterer( $mapa.data('gmap'), undefined, {
            maxZoom:16
          });
        }
        argenmap.agregarMarcador = function(opciones) {
          var _this = this,
            defaults = {
              lat: _this.gmap.getCenter().lat(),
              lng: _this.gmap.getCenter().lng(),
              icono: argenmap.BASEURL + 'img/marcadores/punto.png',
              nombre: 'Marcador_' + Math.floor(Math.random() * 10100),
              contenido: undefined
            };
          opciones = $.extend({}, defaults, opciones);


          //compatibilidad entre lng, lon y long
          if(opciones.hasOwnProperty("long")) {
            //long es un reserved de JS, closure no puede manejarlo
            opciones.lng = opciones['long'];
          }else if(opciones.hasOwnProperty("lon")) {
            opciones.lng = opciones.lon;
          }else if(opciones.hasOwnProperty("lat") && typeof(opciones.lat) === "function"){
            //el argument es un google.maps.LatLng
            opciones.lat = opciones.lat();
            opciones.lng = opciones.lng();
          }

          var marker = {};
          marker.icon = opciones.icono;
          marker.data = opciones.contenido;
          marker.position = new google.maps.LatLng(opciones.lat, opciones.lng);
          marker.title = opciones.nombre;
          //marker.map = _this.gmap;

          var m = new google.maps.Marker(marker);

          this._marcadores[opciones.nombre] = m;
          if (window.sota !== undefined ) {
            sota.push(m);
          } else {
            sota = [];
          }
          _this.markerCluster.addMarker( m, true );

          

          google.maps.event.addListener(m, 'click', function () {
            if (!opciones.contenido) {
              return;
            }
            _this.infoWindow().open(_this.$el.data('gmap'), m);
            _this.infoWindow().setContent(opciones.contenido);
          });

          return;
        }
        var _marcador = {
          nombre: marcador.titulo,
          icono: marcador.capa,
          lat: latlng.lat,
          lng: latlng.lng,
          contenido: $contenido.html(),
        };
        _this.marcadores_parsed.push( _marcador );
        $mapa.agregarMarcador( _marcador );
      
      });
    },
    /**
     * Crea un div con un control que permite ocultar marcadores
     * de a grupos. Los grupos están definidos
     * en la propiedad 'grupo' de cada marcador.
     */
    ControlDeGrupos: function (titulo, marcadores_por_grupo) {
      var _this = this;
      var grupos = [];
      for (x in marcadores_por_grupo) {
        grupos.push(x)
      }
      var $controlDiv = $('<div />');
      // We don't really need to set an index value here, but
      // this would be how you do it. Note that we set this
      // value as a property of the DIV itself.
      $controlDiv.get(0).index = 2;
      
      // Set CSS styles for the DIV containing the control
      // Setting padding to 5 px will offset the control
      // from the edge of the map.
      $controlDiv.css('padding', '5px');

      // Set CSS for the control border.
      var $controlUI = $('<div />').css({
        '-webkit-user-select': 'none',
        'padding': '1px 0px',
        'background-color': 'white',
        'border': '1px solid rgba(0, 0, 0, 0.14902)',
        'cursor': 'pointer',
        'text-align': 'center'
      })
      .appendTo( $controlDiv );


      // Set CSS for the control interior.
      var $controlText = $('<div />').css({
        'font-family': 'Arial, sans-serif',
        'font-weight': 500,
        'font-size': '12px',
        'padding-left': '4px',
        'padding-right': '4px'
      }).html( titulo )
      .attr('title', 'Grupos de marcadores')
      .appendTo( $controlUI );

      $('<img src="http://maps.gstatic.com/mapfiles/arrow-down.png" draggable="false" style="position:relative;-webkit-user-select: none; border: 0px; padding: 0px; margin: -2px 0px 0px 10px; right: 6px; top: 50%; width: 7px; height: 4px;">')
      .appendTo($controlText);

      var $gruposUI = $('<div />').css({
        'text-align': 'left'
      });

      $(grupos).each(function() {
        $gruposUI.append( grupo(this) )
          .appendTo( $controlUI ).hide();
      })

      function grupo(nombreDelGrupo) {
        var $grupoUI = $('<div />');
        var $input = $('<input checked="checked" type="checkbox"/>');
        $input.data('grupo', nombreDelGrupo)
        $input.click(function() {
          if ( $(this).is(':checked')) {
            var grupo = $(this).data('grupo');
            $(marcadores_por_grupo[grupo]).each(function() {
              _this.agregarMarcador(this);
            });            
          } else {
            var grupo = $(this).data('grupo');
            $(marcadores_por_grupo[grupo]).each(function() {
              $mapa.quitarMarcador(this.titulo);
            });
          }
        })
        $grupoUI.append( $input );
        $a = $('<a href="#"></a>').text(nombreDelGrupo);
        var latlngbounds = new google.maps.LatLngBounds();
        $(marcadores_por_grupo[nombreDelGrupo]).each(function(i, v) {
           _this.parseCoordenadas(v.recurso, function(latlng) {
              latlngbounds.extend(new google.maps.LatLng(latlng.lat, latlng.lng));
           });
        });
        $a.click(function() {
          $mapa.data('gmap').setCenter(latlngbounds.getCenter());
          $mapa.data('gmap').fitBounds(latlngbounds);           
          
        });
        $grupoUI.append($a);

        return $grupoUI;
      }

      // Setup the click event listeners: simply set the map to Chicago.
      $controlText.click(function() {
        $gruposUI.toggle();

      });

      // $controlDiv.on("mouseleave", function() {
      //   window.setTimeout(function() {
      //     $gruposUI.hide();
      //   }, 2000);
      // });
      return $controlDiv.get(0);
    },

    /**
     * Crea un div con un control que permite seleccionar
     * una vista predeterminada por provincias y por país.
     * Una vista está definida por un centro y una vista predeterminadas.
     */
    ControlDeVista: function (titulo, vistas) {
      var _this = this;

      var $controlDiv = $('<div/>');
      // We don't really need to set an index value here, but
      // this would be how you do it. Note that we set this
      // value as a property of the DIV itself.
      $controlDiv.get(0).index = 1;
      
      // Set CSS styles for the DIV containing the control
      // Setting padding to 5 px will offset the control
      // from the edge of the map.
      $controlDiv.css({
        'padding': '5px',
        'z-index': '2'
      });

      // Set CSS for the control border.
      var $controlUI = $('<div />').css({
        '-webkit-user-select': 'none',
        'padding': '1px 0px',
        'background-color': 'white',
        'border': '1px solid rgba(0, 0, 0, 0.14902)',
        'cursor': 'pointer',
        'text-align': 'center'
      })
      .appendTo( $controlDiv );


      // Set CSS for the control interior.
      var $controlText = $('<div />').css({
        'font-family': 'Arial, sans-serif',
        'font-weight': 500,
        'font-size': '12px',        
        'padding-left': '4px',
        'padding-right': '4px'
      }).html( titulo )
      .attr('title', 'Vistas a nivel de Provincia')
      .appendTo( $controlUI );

      $('<img src="http://maps.gstatic.com/mapfiles/arrow-down.png" draggable="false" style="position:relative;-webkit-user-select: none; border: 0px; padding: 0px; margin: -2px 0px 0px 10px; right: 6px; top: 50%; width: 7px; height: 4px;">')
      .appendTo($controlText);

      var $vistasUI = $('<select />').css({
        'text-align': 'left'
      });

      var $optgroup = $('<optgroup label="Tierra del Fuego, Antártida e Islas del Atlántico Sur"></optgroup>');
      $(vistas).each(function(i, v) {
        var $option = $('<option></option');
        $option.text(v.nombre);
        $option.val(v.nombre);
        $option.data('vista', v);
        if (i >= 24 ) {
          $optgroup.append( $option );
          $vistasUI.append( $optgroup );
        } else {
          $vistasUI.append( $option );
        }
        $vistasUI.appendTo( $controlUI ).hide();
      })

      $vistasUI.change(function() {
        var $option = $(this).find('option:selected'),
          vista = $option.data().vista,
          $mapa = _this.$el; 
        $mapa.zoom(vista.zoom);
        $mapa.centro(vista.lat, vista.lng);
      });

      // Setup the click event listeners: simply set the map to Chicago.
      $controlText.click(function() {
        $vistasUI.toggle();
      });


      // $vistasUI.on("mouseleave", function() {
      //   window.setTimeout(function() {
      //     $vistasUI.hide();
      //   }, 1000);
      // });

      return $controlDiv.get(0);
    },
    alert: function (msg) {
      var _this = this;
      $(_this.opts.barra_class).fadeIn();
      $(_this.opts.barra_class + ' ' + _this.opts.barra_titulo_class).html("argenWAMP - Error en el mapa");
      $(_this.opts.barra_class + ' ' + _this.opts.barra_descripcion_class).html(msg);
    },

    parseCoordenadas: function  (texto, callback, context) {
      var _this = this;
      var latlng = {
        lat: null,
        lng: null
      };

      if (_this.parseGeograficas(texto)) {
        var parsed = _this.parseGeograficas(texto);
        latlng.lat = parsed.lat.decimal;
        latlng.lng = parsed.lng.decimal;      
        callback(latlng);
      } else if ( _this.parseDMS(texto) ) {
        var parsed = _this.parseDMS(texto);
        latlng.lat = parsed.lat.decimal;
        latlng.lng = parsed.lng.decimal;      
        callback(latlng);        
      } else {
        _this.geoLocate(texto, function(latlng) {
          callback( latlng );
        });
      }
      
    },
    geoLocate: function( str, callback )
    {
      var _this = this,
        latlng = {
          lat:-34,
          lat:-59
        };
      $.getJSON('http://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + str, function(data) {
        if (! data.length) {
          return latlng;
        }
        if (callback) {
          callback({lat: data[0].lat , lng: data[0].lon});
        }
      });        
    },

    fitGeoLocateResult: function( d ) {
      var _this = this;
      var $mapa = _this.$el;
      s = d.boundingbox[0],
      w = d.boundingbox[2],
      n = d.boundingbox[1],
      e = d.boundingbox[3],
      southwest = new google.maps.LatLng(s,w),
      northeast = new google.maps.LatLng(n,w),
      boundingbox = new google.maps.LatLngBounds(southwest, northeast);

      $mapa.data().gmap.fitBounds( boundingbox);
    },

    parseDMS: function( pair ) {
      var tmpLat, tmpLng;
      
      var coord = {
        lat: {decimal:0, deg:0, min:0, sec:0},
        lng: {decimal:0, deg:0, min:0, sec:0}
      };
      // patrón que reconoce lat y longitud en grados, min, y segundos
      // con indicador de sentido de la latitud/longitud (S, N, O, E, o W)
      var pattern =  /[0-9]{1,3}[º°]{1}([0-9]{1,2}['′´]{1}){0,1}([0-9]{1,2}([.,]{1}[0-9]{1,}){0,1}["″¨]{1}){0,1}[sonew]{1}/gi;
      var matches = pair.match(pattern);
      
      // si no hay matches o se encuentra más de UN
      // PAR de coordenadas, no lo proceso como válido
      if (!matches || matches.length > 2 ) {
        return false;
      }
      
      for (var i=0; i<matches.length;i++) {
        var decimal,
          //traigo los grados
          deg = matches[i].match(/[0-9]{1,3}[º°]{1}/g),
          //traigo los minutos
          min = matches[i].match(/[0-9]{1,2}['′´]{1}/g),
          //traigo los segundos
          sec = matches[i].match(/[0-9]{1,2}([.,]{1}[0-9]{1,}){0,1}["″¨]{1}/g),
        
          // dec(linación)(fruta el nombre de la variable).
          // Esto marca si la coordenada parseada es latitud sur o norte
          // o longitud este u oeste.
          dec = matches[i].match(/[sonew]/gi);
        dec = dec[0].toLowerCase();
        
        // esto es porque quizás las coordenadas
        // no tienen min o seg
        deg = $.isArray(deg) ? deg[0] : '';
        min = $.isArray(min) ? min[0] : '';
        sec = $.isArray(sec) ? sec[0] : '';
        
        deg = parseFloat ( deg.replace(',', '.') ) || 0;
        min = parseFloat ( min.replace(',', '.') ) || 0;
        sec = parseFloat ( sec.replace(',', '.') ) || 0;
          
        decimal = deg+ (min/60) + (sec/3600);
          //si es latitud
        if (dec == "s" || dec == "n" ) {
          coord.lat.deg = deg;
          coord.lat.min = min;
          coord.lat.sec = sec;
          coord.lat.decimal = decimal
          // si es latitud negativa
          if ( dec == "s" ) {
            coord.lat.decimal *= -1;
          }
        }
          //si es longitud negativa
        if (dec == "o" || dec == "w" || dec == "e" ) {
          coord.lng.deg = deg;
          coord.lng.min = min;
          coord.lng.sec = sec;          
          coord.lng.decimal = decimal
          // si es latitud negativa
          if ( dec == "o" || dec == "w" ) {
            coord.lng.decimal *= -1;
          }
        }       
      }
      return coord;
    },

    /**
     * Parsea una cadena de texto en búsqueda
     * de coordenadas del tipo lat lng. Es decir
     * solo devuelve las coordenadas parseadas si la cadena contiene
     * un solo par de coordenadas o una sola coordenada.
     * 
     * -El separador decimal es el punto o la coma "." o "," 
     * -El signo "-" se interpreta como indicador de coordenadsa negativas
     * -Las coordenadas positivas no deben tener el signo "+" precedente.
     * Cadenas válidas
     *  32.12 65.32
     *  32,12 65,32
     *  -54.12 65,12 o -54,12 65.12 
     *  -55.23 o -55,23
     *  42.23
     *  
     *  @param string pair: la cadena de texto con el par de coordenadas
     *  en formato "lat lng"
     */
    parseGeograficas: function(pair) {
      var tmpLat, tmpLng;
      
      var coord = {
        lat: {decimal:0, deg:0, min:0, sec:0},
        lng: {decimal:0, deg:0, min:0, sec:0}
      };

      var pattern =  /-{0,1}[0-9]{1,3}([.,]{1}[0-9]{1,}){0,1}/g;
      
      var matches = pair.match(pattern);
      // si no hay matches o se encuentra más de UN
      // PAR de coordenadas, no lo proceso como válido
      if (!matches || matches.length > 2 ) {
        return false;
      }
      //reemplazo las comas por puntos para poder castear bien
      tmpLat = parseFloat ( matches[0].replace(',', '.') );
      // Latitud tiene que estar dentro del rango [-90,90]
      // De lo contrario, directamente devuelvo false
      // con longitud hago el mismo chequeo pero no devuelvo false
      // si 
      if (tmpLat > 90 || tmpLat < -90) {
        return false;
      }
      coord.lat.decimal = tmpLat;
      if ( matches.length > 1 ) {
        //reemplazo las comas por puntos para poder castear bien
        tmpLng = parseFloat ( matches[1].replace(',', '.') );
        // Longitud tiene que estar dentro del rango [-180,180]
        // De lo contrario, seteo lng en false;
        // No vuelvo porque la latitud tiene que estar bien si llegué
        // a este punto
        if (tmpLng > 180 || tmpLng < -180) {
          coord.lng.decimal = undefined;
        } else {
          coord.lng.decimal = tmpLng
        }
      }
      return coord;
    }

  };

  // The actual plugin
  $.fn.argenmapvis = function(options) {
    if(this.length) {
      this.each(function() {
        var rev = new Argenmapvis(this, options);
        rev.init();
        $(this).data('argenmapvis', rev);
      });
    }
  };
})(jQuery);
