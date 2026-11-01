import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'core/api.dart';
import 'core/auth.dart';
import 'core/theme.dart';
import 'router.dart';
import 'widgets/glass.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('tr_TR');
  final theme = ThemeController();
  await Future.wait([Api.i.load(), theme.load()]);
  final auth = AuthController(theme);
  await auth.init();
  runApp(OzguvenisApp(theme: theme, auth: auth));
}

class OzguvenisApp extends StatefulWidget {
  const OzguvenisApp({super.key, required this.theme, required this.auth});
  final ThemeController theme;
  final AuthController auth;
  @override
  State<OzguvenisApp> createState() => _OzguvenisAppState();
}

class _OzguvenisAppState extends State<OzguvenisApp> {
  late final router = buildRouter(widget.auth);
  @override
  Widget build(BuildContext context) => MultiProvider(
        providers: [ChangeNotifierProvider.value(value: widget.theme), ChangeNotifierProvider.value(value: widget.auth)],
        child: Consumer<ThemeController>(
          builder: (c, theme, _) => MaterialApp.router(
            title: 'Özgüveniş',
            debugShowCheckedModeBanner: false,
            routerConfig: router,
            theme: theme.themeData,
            locale: const Locale('tr', 'TR'),
            supportedLocales: const [Locale('tr', 'TR')],
            localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
            builder: (c, child) => WallpaperBackdrop(theme: theme, child: child!),
          ),
        ),
      );
}
