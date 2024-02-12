---
author: 00Masato
pubDatetime: 2024-02-04T11:39:22.987
title: epoll(7) について
slug: epoll(7)
featured: false
description: epoll(7) について
---

[並行プログラミング入門](https://www.oreilly.co.jp//books/9784873119595/)を読んでいて  
epoll(7) に関して自分の理解できている範囲でまとめてみました。

## epoll(7) とは

https://manpages.ubuntu.com/manpages/focal/ja/man7/epoll.7.html　には以下のように書かれています。

> epoll API は poll(2) と同様の処理を行う、つまり、複数のファイルディスク リプタを監視し、そ
> の中のいずれかが入出力可能な状態であるかを確認する。 epoll API は、エッジトリガーインター
> フェースとレベルトリガーインターフェースの いずれとしても使用することができ、監視するファ
> イルディスクリプターの数が多い 場合にも使用できる。

説明そのままなのだが、ファイルディスクリプタを監視して I/O が可能かどうかを監視するLinuxのシステムコールである。  
ちなみに epoll(7) はLinux専用のシステムコールで mac では [kqueue](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kqueue.2.html)が使われる。

そもそも epoll(7) は、複数のAPIからなっているようです。

### epoll_create(2)

epoll(7)インスタンスを作成します。

### epoll_create1(2)

epoll_crate(2)と同じくepoll(7)インスタンスを作成します。  
https://manpages.ubuntu.com/manpages/focal/ja/man7/epoll.7.html には以下のように書かれています。

> epoll_create(2) は epoll インスタンスを作成し、そのインスタンスを参照する ファイルディ
> スクリプターを返す。(もっと新しい epoll_create1(2) では、 epoll_create(2) の機能が拡張
> されている)。

epoll_create1(2)では`EPOLL_CLOEXEC`フラグを引数に設定します。  
このフラグを設定することで設定されたファイルディスクリプタはexec時にcloseされるようになります。  
参考：https://atmarkit.itmedia.co.jp/flinux/rensai/watch2008/watch08a.html

### epoll_ctl(2)

epoll(7)インスタンスの監視対象となっているファイルディスクリプタに対して操作をする。  
操作の種類としては以下がある。

- EPOLL_CTL_ADD
  - 監視対象にファイルディスクリプタを追加する
- EPOLL_CTL_MOD
  - ファイルディスクリプタの設定を変更
- EPOLL_CTL_DEL
  - 監視対象からファイルディスクリプタを削除する

### epoll_wait(2)

epoll(7)インスタンスのイベントを待ちます。

## 使用例

これはhttps://manpages.ubuntu.com/manpages/focal/ja/man7/epoll.7.html のコードをそのまま記載します。

```c
#define MAX_EVENTS 10
struct epoll_event ev, events[MAX_EVENTS];
int listen_sock, conn_sock, nfds, epollfd;

/* Code to set up listening socket, 'listen_sock',
  (socket(), bind(), listen()) omitted */

epollfd = epoll_create1(0);
if (epollfd == -1) {
   perror("epoll_create1");
   exit(EXIT_FAILURE);
}

ev.events = EPOLLIN;
ev.data.fd = listen_sock;
if (epoll_ctl(epollfd, EPOLL_CTL_ADD, listen_sock, &ev) == -1) {
   perror("epoll_ctl: listen_sock");
   exit(EXIT_FAILURE);
}

for (;;) {
   nfds = epoll_wait(epollfd, events, MAX_EVENTS, -1);
   if (nfds == -1) {
       perror("epoll_pwait");
       exit(EXIT_FAILURE);
   }

   for (n = 0; n < nfds; ++n) {
       if (events[n].data.fd == listen_sock) {
           conn_sock = accept(listen_sock,
                           (struct sockaddr *) &local, &addrlen);
           if (conn_sock == -1) {
               perror("accept");
               exit(EXIT_FAILURE);
           }
           setnonblocking(conn_sock);
           ev.events = EPOLLIN | EPOLLET;
           ev.data.fd = conn_sock;
           if (epoll_ctl(epollfd, EPOLL_CTL_ADD, conn_sock,
                       &ev) == -1) {
               perror("epoll_ctl: conn_sock");
               exit(EXIT_FAILURE);
           }
       } else {
           do_use_fd(events[n].data.fd);
       }
   }
}
```

1. `epoll_create1(2)`でepollインスタンスを作る
2. `epoll_ctl(2)`でepollインスタンスのファイルディスクリプタと監視対象のファイルディスクリプタを紐付ける
3. `epoll_wait(2)`でイベントの発生を待つ

という流れになっています。

```c
 if (events[n].data.fd == listen_sock) {
     conn_sock = accept(listen_sock,
                     (struct sockaddr *) &local, &addrlen);
     if (conn_sock == -1) {
         perror("accept");
         exit(EXIT_FAILURE);
     }
     setnonblocking(conn_sock);
     ev.events = EPOLLIN | EPOLLET;
     ev.data.fd = conn_sock;
     if (epoll_ctl(epollfd, EPOLL_CTL_ADD, conn_sock,
                 &ev) == -1) {
         perror("epoll_ctl: conn_sock");
         exit(EXIT_FAILURE);
     }
 } else {
     do_use_fd(events[n].data.fd);
 }
```

最初見た時にこの条件分岐をなぜ行っているのかよくわかりませんでした。  
しかし、[サーバー入門、非同期処理入門、epoll 入門 | blog.ojisan.io](https://blog.ojisan.io/how-to-epoll/) を見てみると
その理由がわかりました。
この条件分岐でリッスンソケットにイベントが発生した時、  
acceptしてそのソケットを`epoll_ctl(2)`で監視対象に追加しています。  
こうすることで、このソケットにイベントが発生した場合に
イベントを捕捉できるようになります。  
リッスンソケットに対するイベント発生時の処理と他のソケットに対するイベント発生時の処理が  
異なるので、この条件分岐を行っているのだと理解しました。

参考文献：

- [Ubuntu Manpage: epoll - I/O イベント通知機能](https://manpages.ubuntu.com/manpages/focal/ja/man7/epoll.7.html)
- [Mac OS X Manual Page For kqueue(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/kqueue.2.html)
- [サーバー入門、非同期処理入門、epoll 入門 | blog.ojisan.io](https://blog.ojisan.io/how-to-epoll/)
- [8月版　ブート時間の短縮にかけるカーネルアスリートたち（1/2） － ＠IT](https://atmarkit.itmedia.co.jp/flinux/rensai/watch2008/watch08a.html)
- [高野 祐輝（2021）.『並行プログラミング入門』.オライリージャパン.](https://www.oreilly.co.jp//books/9784873119595/)
- [参考文献の書き方 - 図書館学習サポーターの学修サポートコンテンツ！](https://niigatau-lib-lss.hateblo.jp/entry/2021/11/22/085348)
